import {effectControls,applyEffects} from './floral-effects.js';
import {projectPanel} from './floral-projects.js';
import {createSelection} from './floral-selection.js';
export function mountEditor(host) {
  const root = document.createElement('section');
  root.className = 'flora-editor';
  root.innerHTML = `<header><h2>Chỉnh sửa ảnh hoa</h2><label class="pick">Mở ảnh<input type="file" accept="image/*"></label></header>
  <div class="layout"><div><div class="stage"><canvas hidden></canvas><span class="empty">Chọn ảnh để bắt đầu chỉnh sửa</span><i hidden></i></div>
  <nav aria-label="Vùng xem"><button data-act="minus">Thu nhỏ</button><output class="zoom">100%</output><button data-act="plus">Phóng to</button><button data-act="fit">Vừa khung</button><button data-act="before" aria-pressed="false">Xem ảnh gốc</button></nav></div>
  <aside><h3>Ánh sáng và màu sắc</h3><div class="sliders"></div><h3>Khung hình</h3><nav><button data-act="crop">Chọn vùng cắt</button><button data-act="apply" hidden>Áp dụng cắt</button><button data-act="left">Xoay trái 90°</button><button data-act="right">Xoay phải 90°</button><button data-act="flipX">Lật ngang</button><button data-act="flipY">Lật dọc</button></nav>
  <nav><button data-act="undo">Hoàn tác</button><button data-act="redo">Làm lại</button><button data-act="export">Tải ảnh PNG</button></nav></aside></div><p role="status"></p>`;
  host.append(root);
  const q = s => root.querySelector(s);
  const stage=q('.stage'), canvas=q('canvas'), box=q('i'), message=q('[role=status]');
  let fileSource, img, name, state, history=[], cursor=0, before=false, crop=false, selection, drag, ticket=0, pending=0;
  let zoom=1, panX=0, panY=0;
  const layers=createSelection(q('aside'),()=>({img,s:state,before,schedule,commit,paint,message,exitCrop:stopCrop}));
  const refreshEffects=effectControls(q('aside'),()=>({s:state,before,commit,paint,schedule}));
  const projects=projectPanel(root,()=>({file:fileSource,name,message,begin:()=>++ticket,
    snapshot:()=>({state:structuredClone(state),history:[...history],cursor,layers:layers.snapshot(),zoom,panX,panY}),
    async restore(file,v,id){
      const url=URL.createObjectURL(file),next=new Image();next.src=url;
      try{await next.decode();if(id!==ticket)return false;
        img=next;name=v.title;fileSource=file;state=v.state;history=v.history;cursor=v.cursor;layers.restore(v.layers);
        before=false;stopCrop();zoom=v.zoom;panX=v.panX;panY=v.panY;
        canvas.hidden=false;q('.empty').hidden=true;paint();return true;
      }finally{URL.revokeObjectURL(url);}
    }
  }));
  const exportBox=document.createElement('fieldset');exportBox.className='flower-output';
  exportBox.innerHTML=`<legend>Xuất ảnh</legend><label>Định dạng <select><option>PNG</option><option>JPG</option></select></label>
    <label>Kích thước <select class="dims"><option value="original">Theo ảnh đang chỉnh</option><option value="custom">Tùy chọn, giữ tỷ lệ</option></select></label>
    <label class="width" hidden>Chiều rộng (px) <input type="number" min="1" step="1"></label><output></output>
    <label class="quality" hidden>Chất lượng JPG (%) <input type="number" min="1" max="100" value="95"></label>`;
  const download=q('[data-act=export]');download.after(exportBox);exportBox.append(download);
  const format=exportBox.querySelector('select'),dims=exportBox.querySelector('.dims'),width=exportBox.querySelector('.width input'),quality=exportBox.querySelector('.quality input');
  function exportOptions(){
    const custom=dims.value==='custom';exportBox.disabled=!state||before;
    width.parentElement.hidden=!custom;quality.parentElement.hidden=format.value!=='JPG';
    if(!custom&&state)width.value=state.w;
    const w=custom?width.valueAsNumber:state?.w,h=Math.max(1,Math.round(w*(state?.h/state?.w)));
    exportBox.querySelector('output').value=w>0&&h>0?w+' × '+h+' px':'';
    download.textContent='Tải ảnh '+format.value;return {w,h};
  }
  exportBox.oninput=exportOptions;
  const side=q('aside'), quick=q('nav[aria-label="Vùng xem"]');
  quick.classList.add('editor-quick');
  const frameTools=q('[data-act=crop]').parentElement;
  quick.append(...frameTools.children,q('[data-act=undo]'),q('[data-act=redo]'));
  const controls=document.createElement('div');controls.className='editor-controls';
  const groupLabel=document.createElement('label');groupLabel.textContent='Nhóm công cụ';
  const group=document.createElement('select');groupLabel.append(group);
  const panels=[
    ['Ánh sáng và màu sắc',q('.sliders')],
    ['Chọn, tách và chỉnh lớp',side.querySelector('section')],
    ['Ánh sáng và hiệu ứng',q('.flower-fx')],
    ['Lưu và mở dự án',q('.flower-projects')],
    ['Xuất ảnh',exportBox]
  ];
  for(const [title,panel] of panels){group.add(new Option(title));controls.append(panel);}
  side.replaceChildren(groupLabel,controls);
  function showGroup(){panels.forEach(([,panel],index)=>{panel.hidden=index!==group.selectedIndex;});controls.scrollTop=0;}
  group.onchange=showGroup;showGroup();
  const labels={light:'Sáng / tối',contrast:'Tương phản',temp:'Nhiệt độ màu',sat:'Độ bão hòa'};
  const sliders={};
  for(const [key,title] of Object.entries(labels)){
    const label=document.createElement('label');
    label.innerHTML=title+' <output>0</output><input type="range" min="-100" max="100" value="0">';
    q('.sliders').append(label);
    const input=sliders[key]=label.querySelector('input');
    input.oninput=()=>{state[key]=Number(input.value);label.querySelector('output').value=input.value;schedule();};
    input.onchange=()=>commit();
  }
  const initial=image=>({w:image.naturalWidth,h:image.naturalHeight,m:[1,0,0,1,0,0],light:0,contrast:0,temp:0,sat:0});
  function commit(){
    const snapshot=JSON.stringify(state);
    if(snapshot!==history[cursor]){history.splice(++cursor);history.push(snapshot);}
    update();
  }
  function update(){
    for(const [key,input] of Object.entries(sliders)){
      input.disabled=!img||before;
      input.value=state?.[key]||0; input.previousElementSibling.value=input.value;
    }
    for(const btn of root.querySelectorAll('[data-act]')){
      const a=btn.dataset.act;
      btn.disabled=!img||(before&&!['before','fit','plus','minus'].includes(a))||(a==='undo'&&!cursor)||(a==='redo'&&cursor===history.length-1)||(a==='apply'&&!selection);
    }
    q('[data-act=before]').setAttribute('aria-pressed',String(before));
    q('[data-act=before]').textContent=before?'Trở về ảnh đang chỉnh':'Xem ảnh gốc';
    q('[data-act=crop]').textContent=crop?'Hủy chọn vùng':'Chọn vùng cắt';
    q('[data-act=apply]').hidden=!crop;
    projects.update();refreshEffects();exportOptions();layers.update();stage.style.cursor=(crop||layers.active())?'crosshair':'grab';
  }
  function raster(target,s,limit,output){
    const scale=Math.min(1,limit/Math.max(s.w,s.h));
    target.width=output?.w??Math.max(1,Math.round(s.w*scale));target.height=output?.h??Math.max(1,Math.round(s.h*scale));
    const ctx=target.getContext('2d',{willReadFrequently:true});
    ctx.scale(target.width/s.w,target.height/s.h);ctx.transform(...s.m);ctx.drawImage(layers.source(img,s),0,0);
    if(!(s.light||s.contrast||s.sat||s.temp)){applyEffects(target,s,layers.parts);return;}
    const frame=ctx.getImageData(0,0,target.width,target.height), p=frame.data;
    const gain=2**(s.light/65), contrast=2**(s.contrast/65), saturation=1+s.sat/100, warm=s.temp/100;
    for(let i=0;i<p.length;i+=4){
      const r=p[i]*(1+.24*warm),g=p[i+1],b=p[i+2]*(1-.24*warm),lum=.2126*r+.7152*g+.0722*b;
      p[i]=128+((lum+(r-lum)*saturation)*gain-128)*contrast;
      p[i+1]=128+((lum+(g-lum)*saturation)*gain-128)*contrast;
      p[i+2]=128+((lum+(b-lum)*saturation)*gain-128)*contrast;
    }
    ctx.putImageData(frame,0,0);applyEffects(target,s,layers.parts);
  }
  function view(){
    if(!img)return;
    const s=before?initial(img):state;
    const fit=Math.min(stage.clientWidth/s.w,stage.clientHeight/s.h);
    canvas.style.width=s.w*fit*zoom+'px';canvas.style.height=s.h*fit*zoom+'px';
    canvas.style.transform='translate(calc(-50% + '+panX+'px),calc(-50% + '+panY+'px))';
    q('.zoom').value=Math.round(zoom*100)+'%';mark();
  }
  function paint(){if(img){raster(canvas,before?initial(img):state,1800);if(!before)layers.overlay(canvas,state);view();}update();}
  function schedule(){cancelAnimationFrame(pending);pending=requestAnimationFrame(paint);}
  function resetView(){zoom=1;panX=panY=0;view();}
  function stopCrop(){crop=false;selection=null;box.hidden=true;drag=null;}
  function mark(){
    box.hidden=!selection;if(!selection)return;
    const rect=canvas.getBoundingClientRect(),area=stage.getBoundingClientRect(),[x,y,w,h]=selection;
    Object.assign(box.style,{left:rect.left-area.left+x*rect.width+'px',top:rect.top-area.top+y*rect.height+'px',width:w*rect.width+'px',height:h*rect.height+'px'});
  }
  new ResizeObserver(view).observe(stage);
  q('.pick input').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    const id=++ticket,url=URL.createObjectURL(file),next=new Image();next.src=url;e.target.value='';
    try{await next.decode();if(id!==ticket)return;
      layers.reset();img=next;name=file.name.replace(/\.[^.]+$/,'');fileSource=file;projects.newImage(name);state=initial(img);history=[JSON.stringify(state)];cursor=0;
      before=false;stopCrop();canvas.hidden=false;q('.empty').hidden=true;message.textContent='';resetView();paint();
    }catch{if(id===ticket)message.textContent='Không đọc được ảnh. Hãy chọn ảnh khác.';}finally{URL.revokeObjectURL(url);}
  };
  function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height].map(n=>Math.max(0,Math.min(1,n)));}
  function originalPoint(e){const [x,y]=point(e);return new DOMPoint(x*state.w,y*state.h).matrixTransform(new DOMMatrix(state.m).inverse());}
  stage.onpointerdown=e=>{
    if(!img||drag||e.button!==0)return;
    if((crop||(!before&&layers.active()))&&e.target!==canvas)return;
    stage.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:point(e),x:e.clientX-panX,y:e.clientY-panY};
    if(!before&&layers.active()){drag.select=true;layers.pointer('down',originalPoint(e));return;}
    if(crop){selection=null;mark();update();}
  };
  stage.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    if(drag.select){layers.pointer('move',originalPoint(e));return;}
    if(crop){const [x,y]=drag.start,[a,b]=point(e);selection=Math.abs(x-a)*state.w>=1&&Math.abs(y-b)*state.h>=1?[Math.min(x,a),Math.min(y,b),Math.abs(x-a),Math.abs(y-b)]:null;mark();update();}
    else{panX=e.clientX-drag.x;panY=e.clientY-drag.y;view();}
  };
  stage.onpointerup=stage.onpointercancel=e=>{if(drag?.id===e.pointerId){if(drag.select)layers.pointer(e.type==='pointercancel'?'cancel':'up',originalPoint(e));drag=null;}};
  function transform(matrix,w,h){
    const m=new DOMMatrix(matrix).multiply(new DOMMatrix(state.m));
    Object.assign(state,{m:[m.a,m.b,m.c,m.d,m.e,m.f],w,h});stopCrop();resetView();commit();paint();
  }
  root.onclick=e=>{
    const a=e.target.closest('button')?.dataset.act;if(!a||!img)return;
    const {w,h}=state;
    if(a==='minus'||a==='plus'){zoom=Math.min(12,Math.max(.125,zoom*(a==='plus'?1.25:.8)));view();}
    if(a==='fit')resetView();
    if(a==='before'){before=!before;stopCrop();paint();}
    if(a==='crop'){layers.pan();if(crop)stopCrop();else crop=true;message.textContent=crop?'Kéo trên ảnh để chọn vùng cần giữ.':'';update();}
    if(a==='apply'&&selection){const [x,y,cw,ch]=selection;transform([1,0,0,1,-Math.round(x*w),-Math.round(y*h)],Math.max(1,Math.round(cw*w)),Math.max(1,Math.round(ch*h)));message.textContent='';}
    if(a==='left')transform([0,-1,1,0,0,w],h,w);
    if(a==='right')transform([0,1,-1,0,h,0],h,w);
    if(a==='flipX')transform([-1,0,0,1,w,0],w,h);
    if(a==='flipY')transform([1,0,0,-1,0,h],w,h);
    if(a==='undo'||a==='redo'){cursor+=a==='undo'?-1:1;state=JSON.parse(history[cursor]);layers.cancel();stopCrop();resetView();paint();}
    if(a==='export'){try{
      const size=exportOptions(),jpg=format.value==='JPG',filename=name;
      if(!Number.isSafeInteger(size.w)||size.w<1||size.w>32767||size.h>32767||size.w*size.h>64000000||(jpg&&(!quality.value||!quality.validity.valid))){
        message.textContent='Kiểm tra kích thước (tối đa 64 megapixel, 32767 px mỗi cạnh) và chất lượng JPG từ 1 đến 100.';return;}
      const out=document.createElement('canvas');raster(out,state,Infinity,size);
      if(jpg){const c=out.getContext('2d');c.resetTransform();c.globalCompositeOperation='destination-over';c.fillStyle='white';c.fillRect(0,0,size.w,size.h);}
      out.toBlob(blob=>{if(!blob){message.textContent='Không xuất được ảnh ở kích thước này.';return;}
        const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename+'-kim-flora.'+(jpg?'jpg':'png');link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);
      },jpg?'image/jpeg':'image/png',quality.valueAsNumber/100);
    }catch{message.textContent='Không xuất được ảnh ở kích thước này.';}}
  };
  update();
}
