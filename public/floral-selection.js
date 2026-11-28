import {growBrush} from './floral-quick-selection.js';
import {layerRenderer,moved,hasLayerComposite} from './floral-layer-render.js';
import {objectTools} from './floral-layer-tools.js';
// Masks use original-image coordinates so zoom, crops and rotations never resample a cutout.
export function createSelection(aside, environment) {
  const panel=document.createElement('section');
  panel.innerHTML=`<h3>Chọn và tách đối tượng</h3><fieldset><label>Công cụ <select class="tool"><option value="">Di chuyển vùng xem</option><option value="move">Kéo đối tượng</option><option value="quick">Chọn nhanh bằng cọ (W)</option><option value="smart">AI · Khoanh sơ bộ</option><option value="brush">Cọ chọn</option><option value="lasso">Khoanh vùng tự do</option><option value="wand">Chọn vùng màu liền nhau</option></select></label>
  <label><input class="erase" type="checkbox"> Bớt khỏi vùng chọn</label>
  <label class="quick-mode" hidden>Chế độ <select><option value="add">Thêm vào vùng chọn</option><option value="new">Vùng chọn mới</option><option value="subtract">Trừ khỏi vùng chọn</option></select></label><label class="size">Cỡ cọ (px) <input type="number" min="1" max="500" value="20"></label>
  <label class="tolerance" hidden>Độ dung sai màu <input type="range" min="1" max="150" value="40"></label>
  <nav class="smart-actions"><button type="button" class="plus-mask">Thêm vùng</button><button type="button" class="minus-mask">Bớt vùng</button><button type="button" class="refine">Tinh chỉnh biên</button><button type="button" class="undo-mask">Hoàn tác vùng chọn</button><button type="button" class="similar">Chọn tương tự</button></nav><small class="smart-status" role="status"></small><label>Tên lớp <input class="name" placeholder="Ví dụ: Hoa hồng bên trái"></label>
  <nav><button type="button" class="save">Tách thành lớp</button><button type="button" class="clear">Hủy vùng chọn</button></nav><div class="layers"></div></fieldset>`;
  aside.append(panel);
  const q=s=>panel.querySelector(s),tool=q('.tool'),cache=new Map();
  let mask, editing, stroke, version=0, rendered='', cachedSource, listOwner, listKey='';
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const compose=layerRenderer(cache);
  const objects=objectTools(panel,cache,environment,v=>{cancel();tool.value=v;environment().exitCrop();},()=>++version);
  const notice=q('.smart-status'),undo=[];
  let request=0,busy=false,outline=null;
  function invalidate(){request++;busy=false;outline=null;}
  function checkpoint(){
    const copy=mask?make(mask.width,mask.height):null;
    if(copy)copy.getContext('2d').drawImage(mask,0,0);
    const max=Math.min(12,Math.max(1,Math.floor(48000000/(4*(mask?.width||1)*(mask?.height||1)))));
    while(undo.length>=max)undo.shift();undo.push(copy);outline=null;
  }
  function contour(){
    if(!mask)return null;
    if(!outline){
      const w=mask.width,h=mask.height,d=mask.getContext('2d').getImageData(0,0,w,h).data;
      outline=make(w,h);const c=outline.getContext('2d'),f=c.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=4*(y*w+x);
        if(d[i+3]>=128&&(x===0||y===0||x+1===w||y+1===h||d[i-1]<128||d[i+7]<128||d[i-4*w+3]<128||d[i+4*w+3]<128)){
          f.data[i]=255;f.data[i+1]=234;f.data[i+2]=93;f.data[i+3]=255;}}
      c.putImageData(f,0,0);
    }return outline;
  }
  async function smart(points,similar=false){
    const id=++request,{img,scheduleOverlay}=environment(),erase=q('.erase').checked&&!similar;
    busy=true;notice.textContent='AI đang xác định đường biên…';update();scheduleOverlay();
    try{
      const {infer,candidates}=await import('./floral-smart-mask.js');
      if(id!==request)return;
      const loops=similar?candidates(img,mask):[points],matches=[];
      for(const loop of loops){if(id!==request)return;try{matches.push(await infer(img,loop,()=>id===request));}catch(e){if(!similar)throw e;}}
      if(id!==request)return;
      if(!matches.length){notice.textContent='Chưa tìm thấy đối tượng tương tự.';return;}
      checkpoint();const c=startMask();c.save();c.globalCompositeOperation=erase?'destination-out':'source-over';
      for(const m of matches)c.drawImage(m.mask,m.x,m.y);c.restore();
      notice.textContent='Kiểm tra đường viền trước khi tách lớp.';
    }catch(e){if(id===request){
        const hint=/^(Khoanh |Vùng khoanh |AI chưa )/.test(e.message||'');
        notice.textContent=hint?e.message:'Không tải hoặc khởi động được bộ nhận diện. Hãy thử lại.';
        if(!hint)console.error('Floral object selection:',e);
      }}
    finally{if(id===request){busy=false;update();scheduleOverlay();}}
  }
  for(const [selector,erase] of [['.plus-mask',false],['.minus-mask',true]])q(selector).onclick=()=>{
    invalidate();if(tool.value==='quick')mode.value=erase?'subtract':'add';else tool.value='brush';q('.erase').checked=erase;environment().exitCrop();environment().paint();
  };
  q('.undo-mask').onclick=()=>{invalidate();mask=undo.pop()||null;notice.textContent='';environment().paint();};
  q('.refine').onclick=async()=>{
    const id=++request;
    busy=true;
    update();
    try{
      const {refine}=await import('./floral-smart-mask.js');
      if(id!==request||!mask)return;
      checkpoint();
      refine(environment().img,mask);
      notice.textContent='';
    }catch{
      if(id===request)notice.textContent='Chưa tinh chỉnh được đường biên. Hãy thử lại.';
    }finally{
      if(id===request){busy=false;update();environment().scheduleOverlay();}
    }
  };
  q('.similar').onclick=()=>smart(null,true);
  function cancel(){invalidate();undo.length=0;notice.textContent='';mask=null;editing=null;stroke=null;q('.name').value='';}
  function reset(){cancel();tool.value='';cache.clear();rendered=listKey='';cachedSource=null;}
  function startMask(){
    const {img}=environment();
    if(!mask)mask=make(img.naturalWidth,img.naturalHeight);
    return mask.getContext('2d',{willReadFrequently:true});
  }
  function line(a,b){
    const ctx=startMask(),radius=Math.min(500,Math.max(1,Number(q('.size input').value)||1))/2;
    ctx.save();ctx.globalCompositeOperation=q('.erase').checked?'destination-out':'source-over';
    ctx.fillStyle=ctx.strokeStyle='#10a790';ctx.lineWidth=radius*2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.beginPath();ctx.arc(b.x,b.y,radius,0,2*Math.PI);ctx.fill();ctx.restore();
  }
  function wand(p){
    const {img}=environment(),ctx=startMask(),w=mask.width,h=mask.height;
    const source=make(w,h),sc=source.getContext('2d');sc.drawImage(img,0,0);
    const data=sc.getImageData(0,0,w,h).data;
    const x=Math.floor(p.x),y=Math.floor(p.y);
    if(x<0||x>=w||y<0||y>=h)return;
    const seed=y*w+x;
    if(!data[4*seed+3])return;
    const tolerance=Number(q('.tolerance input').value)**2;
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),region=sc.createImageData(w,h);
    let tail=0;
    function visit(n){if(seen[n])return;seen[n]=1;const i=n*4,j=seed*4;
      if(!data[i+3]||(data[i]-data[j])**2+(data[i+1]-data[j+1])**2+(data[i+2]-data[j+2])**2>tolerance)return;
      queue[tail++]=n;region.data.set([16,167,144,255],i);
    }
    visit(seed);for(let k=0;k<tail;k++){const n=queue[k],x=n%w;if(x)visit(n-1);if(x+1<w)visit(n+1);if(n>=w)visit(n-w);if(n<w*(h-1))visit(n+w);}
    sc.putImageData(region,0,0);ctx.save();ctx.globalCompositeOperation=q('.erase').checked?'destination-out':'source-over';ctx.drawImage(source,0,0);ctx.restore();
  }
  const mode=q('.quick-mode select');
  let quickSubtract=false,lastUpdate=0,applied=0;
  function quickPreview(){
    const pts=stroke.slice(Math.max(0,applied-1));
    const patch=growBrush(environment().img,pts,Math.max(1,Math.min(500,+q('.size input').value||20)));
    applied=stroke.length;lastUpdate=performance.now();if(!patch)return;
    const c=startMask();c.save();c.globalCompositeOperation=quickSubtract?'destination-out':'source-over';
    c.drawImage(patch.tile,patch.x,patch.y,patch.w,patch.h);c.restore();outline=null;
  }
  function pointer(kind,p,event){
    if(!tool.value)return false;
    if(busy)return true;
    if(tool.value==='quick'){
      if(kind==='down'){checkpoint();stroke=[p];applied=0;quickSubtract=!!event?.altKey||mode.value==='subtract';
        if(!quickSubtract&&mode.value==='new')mask=null;quickPreview();}
      if(kind==='move'&&stroke){stroke.push(p);if(performance.now()-lastUpdate>=45)quickPreview();}
      if(kind==='up'&&stroke){if(stroke.at(-1).x!==p.x||stroke.at(-1).y!==p.y)stroke.push(p);if(applied<stroke.length)quickPreview();stroke=null;}
      if(kind==='cancel'&&stroke){mask=undo.pop()||null;outline=null;stroke=null;}
      if(kind!=='move')update();
      environment().scheduleOverlay();return true;
    }
    if(tool.value==='move')return objects.pointer(kind,p);
    const {scheduleOverlay}=environment();
    if(kind==='down'){if(['brush','lasso','wand'].includes(tool.value))checkpoint();stroke=[p];if(tool.value==='brush')line(p,p);if(tool.value==='wand')wand(p);}
    if(stroke&&kind==='move'){if(tool.value==='brush')line(stroke.at(-1),p);stroke.push(p);}
    if(kind==='up'&&stroke){
      if(tool.value==='smart'&&stroke.length>2)smart(stroke.slice());
      if(tool.value==='lasso'&&stroke.length>2){const ctx=startMask();ctx.save();ctx.globalCompositeOperation=q('.erase').checked?'destination-out':'source-over';ctx.fillStyle='#10a790';ctx.beginPath();for(const pt of stroke)ctx.lineTo(pt.x,pt.y);ctx.closePath();ctx.fill();ctx.restore();}
      stroke=null;
    }
    if(kind==='cancel')stroke=null;
    if(kind!=='move')update();
    scheduleOverlay();return true;
  }
  function overlay(canvas,s){
    if(!mask&&!stroke)return;
    const c=canvas.getContext('2d');c.save();c.setTransform(canvas.width/s.w,0,0,canvas.height/s.h,0,0);c.transform(...s.m);
    if(mask){c.globalAlpha=.48;c.drawImage(mask,0,0);c.globalAlpha=1;if(!stroke)c.drawImage(contour(),0,0);}
    if((tool.value==='lasso'||tool.value==='smart')&&stroke?.length){c.strokeStyle='#08d1bc';c.lineWidth=2*s.w/canvas.width;c.beginPath();for(const p of stroke)c.lineTo(p.x,p.y);c.stroke();}
    c.restore();
  }
  function commitMask(){
    const {s,commit,paint,message}=environment();
    if(!mask)return;
    const layers=s.layers||[],target=layers.find(x=>x.id===editing);
    if(target?.locked)return;
    const ctx=mask.getContext('2d'),frame=ctx.getImageData(0,0,mask.width,mask.height),d=frame.data;
    for(const layer of layers){if(layer.id===editing||layer.copy)continue;
      const part=cache.get(layer.key);for(let y=0;y<part.h;y++)for(let x=0;x<part.w;x++){
        const i=4*((part.y+y)*mask.width+part.x+x)+3;
        d[i]=Math.max(0,d[i]-part.alpha[y*part.w+x]);
      }
    }
    let x0=mask.width,y0=mask.height,x1=-1,y1=-1;
    for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(d[(y*mask.width+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<0){message.textContent='Chọn một vùng còn thuộc lớp ảnh nền.';return;}
    const w=x1-x0+1,h=y1-y0+1,alpha=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)alpha[y*w+x]=d[4*((y0+y)*mask.width+x0+x)+3];
    const key=++version;cache.set(key,{x:x0,y:y0,w,h,alpha});
    const name=q('.name').value.trim()||target?.name||'Đối tượng '+(layers.length+1);
    if(target)Object.assign(target,{key,name});else(s.layers??=[]).push({id:key,key,name,visible:true,locked:false});
    cancel();objects.select(target?.id??key);message.textContent='';commit();paint();
  }
  function source(img,s){
    const layers=s.layers||[];
    if(s.removed?.length||layers.some(l=>moved(l)||l.color||l.copy||hasLayerComposite(l))){
      const sig=JSON.stringify([s.hideBase,layers,s.removed]);if(rendered!==sig){cachedSource=compose(img,s);rendered=sig;}return cachedSource;
    }
    if(!s.hideBase&&layers.every(l=>l.visible))return img;
    const sig=JSON.stringify([!!s.hideBase,layers.map(l=>[l.key,l.visible])]);if(sig===rendered)return cachedSource;
    const w=img.naturalWidth,h=img.naturalHeight,out=make(w,h),ctx=out.getContext('2d');ctx.drawImage(img,0,0);
    const frame=ctx.getImageData(0,0,w,h),coverage=new Uint8ClampedArray(w*h);
    for(const l of layers){if(s.hideBase?!l.visible:l.visible)continue;const p=cache.get(l.key);
      for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)coverage[(p.y+y)*w+p.x+x]+=p.alpha[y*p.w+x];}
    for(let i=0;i<coverage.length;i++)frame.data[4*i+3]*=(s.hideBase?coverage[i]:255-coverage[i])/255;
    ctx.putImageData(frame,0,0);rendered=sig;cachedSource=out;return out;
  }
  function update(){
    const {s,before,img,commit,paint}=environment();q('fieldset').disabled=!img||before;
    q('.quick-mode').hidden=tool.value!=='quick';q('.erase').parentElement.hidden=tool.value==='quick';q('.size').hidden=!['brush','quick'].includes(tool.value);q('.tolerance').hidden=tool.value!=='wand';
    q('.similar').disabled=q('.refine').disabled=!mask||busy;q('.undo-mask').disabled=!undo.length||busy;
    q('.save').disabled=!mask||busy;q('.save').textContent=editing?'Lưu vùng chọn':'Tách thành lớp';
    objects.refresh();
    const key=JSON.stringify([s?.layers?.map(l=>[l.id,l.key,l.name,l.visible,l.locked,l.copy,moved(l)]),s?.hideBase]);if(key===listKey&&listOwner===s)return;listKey=key;listOwner=s;
    const list=q('.layers');list.replaceChildren();if(!s)return;
    function add(row,text,click,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;b.onclick=click;row.append(b);}
    for(const layer of [...(s.layers||[])].reverse()){
      const row=document.createElement('nav'),title=document.createElement('strong');title.textContent=layer.name;row.append(title);list.append(row);
      add(row,'Chỉnh lớp',()=>{cancel();objects.select(layer.id);paint();});
      add(row,layer.visible?'Ẩn':'Hiện',()=>{layer.visible=!layer.visible;commit();paint();});
      add(row,layer.locked?'Mở khóa':'Khóa',()=>{if(editing===layer.id)cancel();layer.locked=!layer.locked;commit();paint();});
      add(row,'Sửa vùng',()=>{cancel();editing=layer.id;const ctx=startMask(),p=cache.get(layer.key),frame=ctx.createImageData(p.w,p.h);for(let i=0;i<p.alpha.length;i++)frame.data.set([16,167,144,p.alpha[i]],4*i);ctx.putImageData(frame,p.x,p.y);tool.value='brush';q('.name').value=layer.name;paint();},layer.locked||layer.copy||moved(layer));
    }
    if(s.layers?.length)add(list,s.hideBase?'Hiện nền':'Ẩn nền',()=>{s.hideBase=!s.hideBase;commit();paint();});
  }
  tool.onchange=()=>{invalidate();stroke=null;environment().exitCrop();environment().paint();};
  q('.save').onclick=commitMask;q('.clear').onclick=()=>{invalidate();checkpoint();mask=null;stroke=null;notice.textContent='';environment().paint();};
  function snapshot(){
    return {parts:[...cache],version,editing,name:q('.name').value,tool:tool.value,
      mask:mask?.getContext('2d').getImageData(0,0,mask.width,mask.height)};
  }
  function restore(saved){
    reset();for(const [key,p] of saved.parts)cache.set(key,p);version=saved.version;
    editing=saved.editing;q('.name').value=saved.name;tool.value=saved.tool;
    if(saved.mask)startMask().putImageData(saved.mask,0,0);
    objects.select(editing||environment().s.layers?.at(-1)?.id);
  }
  function quick(){tool.value='quick';tool.onchange();notice.textContent='Quét bên trong đối tượng. Giữ Alt để bớt vùng.';}
  return {quick,move(){cancel();tool.value='move';environment().exitCrop();update();},parts:cache,snapshot,restore,pointer,overlay,source,update,reset,cancel,active:()=>!!tool.value,pan:()=>{invalidate();tool.value='';stroke=null;}};
}
