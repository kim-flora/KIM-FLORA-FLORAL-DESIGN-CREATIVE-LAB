const key = 'kim_flora_composition_reports_v1';
const get = id => document.getElementById('comp-' + id);
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length/2)];
export function analyze({data, width:w, height:h}) {
  const border = [[],[],[]];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    if(x && y && x<w-1 && y<h-1) continue;
    const i=(y*w+x)*4;
    for(let k=0;k<3;k++) border[k].push(data[i+k]);
  }
  const bg=border.map(median);
  const distance=i=>Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2]);
  const noise=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(!x||!y||x===w-1||y===h-1) noise.push(distance(4*(y*w+x)));
  const threshold=Math.max(32,median(noise)*2.2);
  const mask=new Uint8Array(w*h);
  let n=0, weight=0,sx=0,sy=0,xx=0,yy=0,xy=0,left=w,right=0,top=h,bottom=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const p=y*w+x,d=distance(p*4);
    if(d<threshold) continue;
    mask[p]=1;n++;weight+=d;sx+=x*d;sy+=y*d;
    xx+=x*x*d; yy+=y*y*d; xy+=x*y*d;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(n<w*h*.012 || n>w*h*.94 || threshold>150) return null;
  const x=sx/weight,y=sy/weight, a=xx/weight-x*x,b=yy/weight-y*y,c=xy/weight-x*y;
  const directional=Math.hypot(a-b,2*c)/Math.max(1,a+b)>.44;
  const ratio=(bottom-top+1)/(right-left+1);
  const lines=[
    'Khối ước lượng '+(ratio>1.2?'thiên dọc':ratio<.83?'trải ngang':'gần vuông')+' · cao/rộng '+ratio.toFixed(2)+'.',
    'Trọng tâm tương phản ở '+Math.round(100*x/w)+'% chiều ngang và '+Math.round(100*y/h)+'% chiều cao, tính từ góc trên trái.',
    'Vùng gần màu nền chiếm '+Math.round(100*(1-n/(w*h)))+'% khung ảnh. Nền, giấy gói và bình có thể ảnh hưởng kết quả.',
    directional?'Khối có trục kéo dài rõ. Bật Trục chính để đối chiếu hướng cành dẫn với trục này.':'Khối chưa thể hiện trục kéo dài rõ.',
    'Thứ bậc và nhịp điệu · Quan sát cụm hút mắt đầu tiên rồi lần theo các bông lặp lại. Nếu hai cụm tranh điểm nhấn, thử hạ một cụm phụ xuống một lớp và so sánh lại.'
  ];
  return {x,y,mask,directional,angle:.5*Math.atan2(2*c,a-b),lines};
}
export function setup(){
  const canvas=get('canvas'),ctx=canvas.getContext('2d');
  let pixels,result,sequence=0;
  const status=text=>get('status').textContent=text;
  function draw(){
    ctx.putImageData(pixels,0,0);
    if(!result) return;
    const w=canvas.width,h=canvas.height,{mask,x,y,angle}=result;
    for(const input of get('layers').querySelectorAll('input:checked')){
      ctx.strokeStyle='#e39a39';ctx.fillStyle='#174e41';ctx.lineWidth=2;
      if(input.value==='outline'){
        for(let j=1;j<h-1;j++) for(let i=1;i<w-1;i++){
          const p=j*w+i;
          if(mask[p] && !(mask[p-1]&&mask[p+1]&&mask[p-w]&&mask[p+w])) ctx.fillRect(i,j,1,1);
        }
      }
      ctx.beginPath();
      if(input.value==='center') ctx.arc(x,y,6,0,2*Math.PI);
      if(input.value==='grid') for(const t of [1/3,2/3]){
        ctx.moveTo(w*t,0);ctx.lineTo(w*t,h);ctx.moveTo(0,h*t);ctx.lineTo(w,h*t);
      }
      if(input.value==='axis' && result.directional){
        const len=Math.min(w,h)*.35,dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;
        ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);
      }
      ctx.stroke();
    }
  }
  function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
  async function open(file){
    if(!file) return;
    const ticket=++sequence; result=null;
    get('layers').hidden=get('result').hidden=canvas.hidden=true;
    const url=URL.createObjectURL(file);
    try {
      status('Đang đọc ảnh…');
      const img=new Image();img.src=url;await img.decode();
      if(ticket!==sequence)return;
      const scale=Math.min(1,620/img.width,480/img.height);
      canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      pixels=ctx.getImageData(0,0,canvas.width,canvas.height);result=analyze(pixels);
      canvas.hidden=false;
      if(!result){status('Chưa xác định được chủ thể. Thử ảnh có nền đều và thấy trọn dáng hoa.');return;}
      get('file').value='';get('title').value=file.name.replace(/\.[^.]+$/,'');get('note').value='';
      get('findings').replaceChildren(...result.lines.map(t=>element('p',t)));
      get('layers').hidden=get('result').hidden=false;draw();status('Đã phân tích ảnh.');
    } catch {if(ticket===sequence)status('Chưa đọc được ảnh. Hãy chọn tệp JPG, PNG hoặc WebP.');}
    finally{URL.revokeObjectURL(url);}
  }
  get('file').onchange=e=>open(e.target.files[0]);get('layers').onchange=draw;
  get('drop').ondragover=e=>e.preventDefault();
  get('drop').ondrop=e=>{e.preventDefault();open(e.dataTransfer.files[0]);};
  function read(){const rows=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(rows))throw Error();return rows;}
  function history(){
    try{get('history').replaceChildren(...read().map(report=>{
      const row=element('details','');row.append(element('summary',report.title),element('p',report.summary));
      const del=element('button','Xóa báo cáo');del.className='secondary';del.onclick=()=>{
        try{localStorage.setItem(key,JSON.stringify(read().filter(r=>r.id!==report.id)));history();}
        catch{status('Chưa xóa được báo cáo.');}
      };row.append(del);return row;
    }));}catch{status('Chưa đọc được hồ sơ trên thiết bị.');}
  }
  function reportText(){return [...result.lines,get('note').value.trim()].filter(Boolean).join('\n');}
  get('save').onclick=()=>{
    if(!result)return;
    try{const report={id:crypto.randomUUID(),title:get('title').value.trim()||'Báo cáo bố cục',summary:reportText(),createdAt:new Date().toISOString()};
      localStorage.setItem(key,JSON.stringify([report,...read()]));history();status('Đã lưu báo cáo trên thiết bị.');
    }catch{status('Chưa lưu được báo cáo. Bạn có thể xuất HTML để giữ bản sao.');}
  };
  get('export').onclick=()=>{
    if(!result)return;
    const article=element('article','');const img=new Image();img.src=canvas.toDataURL('image/jpeg',.82);img.alt='Bản đồ bố cục';
    article.append(element('h1',get('title').value||'Báo cáo bố cục'),img,...reportText().split('\n').map(t=>element('p',t)));
    const url=URL.createObjectURL(new Blob(['<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Báo cáo Kim Flora</title><style>body{max-width:48rem;margin:auto;padding:1em;font:16px/1.5 system-ui}img{max-width:100%}</style>',article.outerHTML],{type:'text/html'}));
    const link=element('a','');link.href=url;link.download='kim-flora-bo-cuc.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  history();
}
