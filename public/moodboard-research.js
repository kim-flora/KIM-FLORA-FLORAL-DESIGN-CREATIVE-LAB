import { flowerLeafSamples } from './moodboard-mask.js';
import { extractPalette } from './color-model.js';

export function mount(host,legacy,oldImages,actions){
  const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const button=(text,fn)=>{const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
  const status=el('p');status.setAttribute('role','status');
  const studies=new Map(),chosen=new Set(), saved=new Map();
  let active=null,comparison='',queue=Promise.resolve();
  const cache=()=>caches.open('kim-flora-research-v1');
  const address=id=>new URL('/__local_moodboard__/'+id,location.origin).href;
  async function write(id,value){await (await cache()).put(address(id),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}
  async function get(id){const response=await (await cache()).match(address(id));return response?response.json():null;}
  const fields={idea:'Ý tưởng và căn cứ',form:'Hình khối và tổ chức hoa',palette:'Bảng phối đề xuất',materials:'Hoa, vật liệu và ánh sáng',focus:'Điểm nhấn',make:'Triển khai',change:'Thay đổi so với mẫu'};
  const upload=el('input');upload.type='file';upload.multiple=true;upload.accept='image/*';
  const fileLabel=el('label','Tải ảnh nghiên cứu');fileLabel.append(upload);
  const library=el('details');library.append(el('summary','Nghiên cứu và phương án đã lưu trên thiết bị'));
  const list=el('div');library.append(list);
  const gallery=el('div','','mr-gallery'),workspace=el('div'),compare=el('section');
  const old=el('details');old.append(el('summary','Mở công cụ và concept phiên bản trước'),legacy);let opened=false;old.ontoggle=()=>{if(old.open&&!opened){opened=true;actions.legacy();}};
  host.append(el('h2','Floral Design Moodboard'),fileLabel,status,gallery,workspace,compare,library,old);
  const putText=(parent,title,obj,key)=>{
    const label=el('label',title,'mr-field'),area=el('textarea');area.rows=2;area.value=obj[key]||'';
    area.oninput=()=>{obj[key]=area.value;comparison='';};label.append(area);parent.append(label);
    requestAnimationFrame(()=>{area.style.height='auto';area.style.height=Math.max(60,area.scrollHeight+4)+'px';});
  };
  function asData(blob){return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(blob);});}
  async function imageInput(source){
    const img=new Image();img.src=source;await img.decode();
    const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(img.width,img.height));
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const image=canvas.toDataURL('image/jpeg',.77);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    const summarize=colors=>{const total=colors.reduce((n,c)=>n+c.weight,0);return colors.map(c=>({hex:c.hex,percent:Math.round(100*c.weight/total)}));};
    const palette=summarize(extractPalette(pixels.data,7,pixels.width));
    const thumb=document.createElement('canvas');const shrink=Math.min(1,180/Math.max(canvas.width,canvas.height));
    thumb.width=Math.max(1,Math.round(canvas.width*shrink));thumb.height=Math.max(1,Math.round(canvas.height*shrink));
    const small=thumb.getContext('2d');small.drawImage(canvas,0,0,thumb.width,thumb.height);
    const samples=flowerLeafSamples(small.getImageData(0,0,thumb.width,thumb.height).data,thumb.width,thumb.height,1);
    let subject=[];
    if(samples.length>thumb.width*thumb.height*.02&&samples.length<thumb.width*thumb.height*.91){
      const rgba=new Uint8ClampedArray(samples.length*4);
      samples.forEach((c,i)=>rgba.set([...c,255],4*i));
      subject=summarize(extractPalette(rgba,6,samples.length));
    }
    return {image,palette,subject};
  }
  async function ask(body){
    const res=await fetch('/api/moodboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json();if(!res.ok)throw Error(json.message||'Dịch vụ AI chưa sẵn sàng.');return json;
  }
  async function analyze(s){
    s.busy=true;s.error='';draw();
    try{const input=await imageInput(s.source);s.palette=input.palette;s.subject=input.subject;draw();s.result=await ask({image:input.image,palette:{whole:input.palette,subject:input.subject}});}
    catch(e){s.error=e.message||'Chưa đọc được ảnh.';}finally{s.busy=false;draw();}
  }
  function add(source,name){
    const s={id:crypto.randomUUID(),name,source,palette:[],result:null,note:'',busy:true};
    studies.set(s.id,s);active=s.id;comparison='';draw();
    queue=queue.then(()=>analyze(s)).catch(()=>{s.busy=false;draw();});
  }
  upload.onchange=async()=>{const files=[...upload.files];upload.value='';for(const f of files){try{add(await asData(f),f.name);}catch{status.textContent='Chưa đọc được '+f.name;}}};
  async function save(s,p=null){
    try{
      const id=p?'plan-'+s.id+'-'+s.result.plans.indexOf(p):'study-'+s.id;
      const item=p?{kind:'plan',name:p.name,source:s.source,plan:p,studyName:s.name}:{kind:'study',name:s.name,study:{id:s.id,name:s.name,source:s.source,palette:s.palette,subject:s.subject,result:s.result,note:s.note}};
      await write(id,item);saved.set(id,item.name);renderList();status.textContent='Đã lưu '+item.name+'.';
    }catch{status.textContent='Chưa lưu được trên thiết bị này. Kiểm tra dung lượng trình duyệt.';}
  }
  function renderList(){list.replaceChildren();for(const [id,title] of saved)list.append(button(title,async()=>{
    try{const item=await get(id);if(!item)throw Error();
      if(item.kind==='study'){if(!studies.has(item.study.id))studies.set(item.study.id,item.study);active=item.study.id;draw();}
      else{const d=el('dialog','','mr-dialog');d.append(el('h3',item.name),el('p',item.studyName));const img=el('img');img.src=item.source;img.alt=item.studyName;d.append(img);
        for(const [k,label] of Object.entries(fields))d.append(el('h4',label),el('p',item.plan[k]));
        d.append(button('Đóng',()=>d.close()));document.body.append(d);d.onclose=()=>d.remove();d.showModal();}
    }catch{status.textContent='Chưa mở được bản lưu.';}
  }));}
  async function restoreList(){try{for(const req of await (await cache()).keys()){const id=new URL(req.url).pathname.split('/').pop();const item=await get(id);if(item)saved.set(id,item.name);}renderList();}catch{status.textContent='Bộ nhớ trên thiết bị chưa sẵn sàng.';}}
  function draw(){
    gallery.replaceChildren();workspace.replaceChildren();
    for(const s of studies.values()){
      const pick=button(s.name,()=>{active=s.id;draw();});pick.setAttribute('aria-pressed',String(active===s.id));gallery.append(pick);
    }
    const s=studies.get(active);
    if(!s){drawCompare();return;}
    const grid=el('div','','mr-grid'),visual=el('section'),text=el('article');
    const frame=el('div','','mr-photo'),img=el('img');img.src=s.source;img.alt=s.name;frame.append(img);
    visual.append(el('h3',s.name),frame);grid.append(visual,text);workspace.append(grid);
    if(s.palette.length){visual.append(el('h4','Màu lấy mẫu trên toàn khung ảnh'));const strip=el('div','','mr-strip');for(const c of s.palette){const sw=el('span',c.hex+' · '+c.percent+'%');sw.style.borderTop='12px solid '+c.hex;strip.append(sw);}visual.append(strip,button('Dùng bảng màu trong Color Studio',()=>actions.palette(s.palette)));}
    if(s.subject?.length){visual.append(el('h4','Màu vùng chủ thể ước lượng'));const strip=el('div','','mr-strip');for(const c of s.subject){const sw=el('span',c.hex+' · '+c.percent+'%');sw.style.borderTop='12px solid '+c.hex;strip.append(sw);}visual.append(strip);}
    if(!s.result){text.append(el('p',s.busy?'Đang phân tích riêng ảnh này…':s.error||'Chưa có kết quả.'));
      if(!s.busy)text.append(button('Phân tích lại ảnh',()=>analyze(s)));drawCompare();return;}
    const report=s.result;
    putText(text,'Quan sát tác phẩm',report,'observations');
    text.append(el('h3','Ngôn ngữ thiết kế'));
    report.findings.forEach((f,i)=>{
      const detail=el('details','','mr-finding');detail.append(el('summary',(i+1)+'. '+f.topic));
      for(const [k,label] of [['seen','Quan sát'],['where','Vị trí'],['effect','Tác động thị giác'],['apply','Ứng dụng']])putText(detail,label,f,k);
      if(Number.isFinite(f.x)&&Number.isFinite(f.y)&&f.x>=0&&f.x<=1&&f.y>=0&&f.y<=1){
        const pin=button(String(i+1),()=>{detail.open=true;detail.scrollIntoView({block:'center'});});pin.className='mr-pin';pin.title=f.topic;pin.style.left=100*f.x+'%';pin.style.top=100*f.y+'%';frame.append(pin);
      }text.append(detail);
    });
    putText(text,'Vai trò và quan hệ màu',report,'color');putText(text,'Giới hạn quan sát',report,'limits');putText(text,'Hướng phát triển',report,'directions');putText(text,'Ghi chú nghiên cứu',s,'note');
    text.append(button('Lưu phân tích và ảnh',()=>save(s)));
    if(report.plans.length){workspace.append(el('h3','So sánh phương án thiết kế'));
      const designs=el('div','','mr-plans');for(const p of report.plans){const panel=el('section');putText(panel,'Tên phương án',p,'name');
        for(const [key,label] of Object.entries(fields))putText(panel,label,p,key);
        panel.append(button('Lưu riêng phương án',()=>save(s,p)),button('Chuyển ý tưởng sang Recipe Builder',()=>actions.recipe(p)));designs.append(panel);}workspace.append(designs);}
    drawCompare();
  }
  function drawCompare(){
    compare.replaceChildren();const complete=[...studies.values()].filter(s=>s.result);
    if(complete.length<2)return;
    compare.append(el('h3','Đối chiếu nhiều tác phẩm'));
    for(const s of complete){const label=el('label',s.name),check=el('input');check.type='checkbox';check.checked=chosen.has(s.id);
      check.onchange=()=>{if(check.checked)chosen.add(s.id);else chosen.delete(s.id);comparison='';drawCompare();};label.prepend(check);compare.append(label);}
    const run=button('So sánh các ảnh đã chọn',async()=>{
      const ids=[...chosen];run.disabled=true;
      try{const reports=ids.map(id=>{const s=studies.get(id);return JSON.stringify({name:s.name,observations:s.result.observations,findings:s.result.findings,color:s.result.color,limits:s.result.limits,note:s.note}).slice(0,18000);});
        const answer=await ask({compare:reports});if(JSON.stringify(ids)===JSON.stringify([...chosen]))comparison=answer.comparison;
      }catch(e){status.textContent=e.message;}finally{drawCompare();}
    });run.disabled=chosen.size<2||chosen.size>4;compare.append(run);if(comparison)compare.append(el('p',comparison));
  }
  if(oldImages?.length)host.insertBefore(button('Nghiên cứu ảnh trong Moodboard trước',()=>{for(const [i,src] of oldImages.entries())if(![...studies.values()].some(s=>s.source===src))add(src,'Ảnh đã lưu '+(i+1));}),gallery);
  restoreList();draw();
}