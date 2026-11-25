import { extractPalette, hexToHsl } from './color-model.js';
const samples = [[[102,105,25],[142,91,21],[72,75,15],[57,49,10],[178,103,14],[207,88,8]],[[160,80,23],[120,91,22],[200,91,22],[97,122,20],[223,122,20],[139,120,25],[181,120,25]],[[109,48,22],[143,64,29],[162,93,22],[180,120,15],[190,145,10],[197,164,6]]];

function sampleFile(index, title) {
  const blooms = samples[index];
  const leaves = blooms.map(([x,y,r], i) => {
    const angle = i % 2 ? -32 : 28;
    return `<ellipse cx="${x-r}" cy="${y+6}" rx="${r}" ry="${r*.38}" fill="#5d7966" transform="rotate(${angle} ${x-r} ${y+6})"/>`;
  });
  const flowers = blooms.map(([x,y,r], i) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${['#ca826d','#e8ac94','#d79682'][i%3]}"/><circle cx="${x}" cy="${y}" r="${r*.34}" fill="${i===1?'#70283c':'#c48170'}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f6f0e9"/>${leaves.join('')}${flowers.join('')}</svg>`;
  return new File([svg], title+'.svg', {type:'image/svg+xml'});
}

// Compare local contrast against typical pixels belonging to the subject.
function focalRegion(data, mask, width, height, background) {
  const size = Math.max(3, Math.round(Math.min(width,height)/18));
  const cols = Math.ceil(width/size);
  const cells = new Map();
  let total = 0, count = 0;
  for (let p=0;p<mask.length;p++) {
    if (!mask[p]) continue;
    const x=p%width, y=Math.floor(p/width), i=p*4;
    const distance=Math.hypot(...background.map((v,k)=>data[i+k]-v));
    const id=Math.floor(y/size)*cols+Math.floor(x/size);
    const cell=cells.get(id) || {sum:0,count:0,x:0,y:0};
    cell.sum+=distance; cell.count++; cell.x+=x; cell.y+=y;
    cells.set(id,cell); total+=distance; count++;
  }
  let best=null, peak=total/count*1.18;
  for(const cell of cells.values()){
    const strength=cell.sum/cell.count;
    if(cell.count>=size*size*.6 && strength>peak){
      peak=strength;
      best={x:cell.x/cell.count,y:cell.y/cell.count};
    }
  }
  return best;
}
const key = 'kim_flora_composition_reports_v1';
const get = id => document.getElementById('comp-' + id);
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length/2)];
function regions(data,mask,w,h,bounds){
  const [left,top,right,bottom]=bounds;
  const span=Math.max(4,Math.round(Math.min(right-left+1,bottom-top+1)/6));
  const cols=Math.ceil(w/span), cells=new Map();
  let edges=0, count=0;
  for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++){
    const p=y*w+x;
    if(!mask[p])continue;
    const i=p*4, k=Math.min(w-1,x+1)+y*w, m=Math.min(h-1,y+1)*w+x;
    const edge=Math.max(...[0,1,2].map(c=>Math.max(Math.abs(data[i+c]-data[k*4+c]),Math.abs(data[i+c]-data[m*4+c]))));
    count++;
    if(edge<24)continue;
    edges++;
    const id=Math.floor(y/span)*cols+Math.floor(x/span);
    const cell=cells.get(id)||{x:0,y:0,n:0};
    cell.x+=x;cell.y+=y;cell.n++;cells.set(id,cell);
  }
  const peaks=[];
  for(const cell of [...cells.values()].sort((a,b)=>b.n-a.n)){
    if(cell.n<Math.max(3,span*.6))break;
    const x=cell.x/cell.n,y=cell.y/cell.n;
    if(peaks.every(p=>Math.hypot(p.x-x,p.y-y)>span*1.6)){
      peaks.push({x,y,r:Math.max(3,Math.sqrt(cell.n))});
      if(peaks.length===5)break;
    }
  }
  return {peaks,density:Math.round(100*edges/count)};
}
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
    directional?'Khối có trục kéo dài rõ. Bật Dòng chảy để đối chiếu hướng cành dẫn với trục này.':'Khối chưa thể hiện trục kéo dài rõ.',
    'Thứ bậc và nhịp điệu · Quan sát cụm hút mắt đầu tiên rồi lần theo các bông lặp lại. Nếu hai cụm tranh điểm nhấn, thử hạ một cụm phụ xuống một lớp và so sánh lại.'
  ];
  const focal=focalRegion(data,mask,w,h,bg);
  const clipped=left===0 || right===w-1 || top===0 || bottom===h-1;
  const shifted=Math.abs(x/w-.5)>.1;
  const groups=[
    ['Điểm mạnh',directional?'Trục dài hiện rõ trong khối. Có thể dùng hướng này để nhấn đường vươn hoặc đường rủ.':shifted?'Khối lệch về phía '+(x<w/2?'trái':'phải')+', tạo điều kiện dùng khoảng trống phía đối diện làm đối trọng.':'Trọng tâm nằm gần trục giữa, thuận lợi nếu bạn muốn phom hoa nhìn ổn định.'],
    ['Điểm yếu cần kiểm tra',clipped?'Biên chủ thể chạm mép ảnh. Một phần cành hoặc vật liệu có thể bị cắt khỏi khung.':focal?'Vùng đánh dấu có tương phản cao. Kiểm tra xem đó là hoa chính, phần giấy gói hay một mảng lá tối.':'Chưa thấy vùng tương phản vượt trội. Nếu muốn nhấn một bông chính, hãy kiểm tra xem mặt hoa có bị các bông phụ che khuất.'],
    ['Cách chỉnh hoa',clipped?'Chụp lùi để thấy đủ ngọn cành rồi đối chiếu hình bao trước khi tỉa.':focal?'Nếu dấu rơi vào lá hoặc giấy, thử xoay mặt lá hoặc hạ nếp giấy gần hoa chính. Chụp lại cùng góc để xem điểm hút mắt có chuyển về hoa không.':'Thử xoay mặt hoa chính về góc nhìn chủ đạo và hạ một bông phụ cạnh nó. Khoảng hở giữa hai lớp sẽ giúp đọc rõ cụm chính.']
  ];
  const {peaks,density}=regions(data,mask,w,h,[left,top,right,bottom]);
  const angle=.5*Math.atan2(2*c,a-b);
  peaks.sort((p,q)=>(p.x-q.x)*Math.cos(angle)+(p.y-q.y)*Math.sin(angle));
  const path=directional && peaks.length>=2 ? peaks : [];
  const widths=[];
  const dx=Math.cos(angle),dy=Math.sin(angle);
  for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){
    if(!mask[py*w+px])continue;
    const bin=Math.floor(((px-x)*dx+(py-y)*dy)/Math.max(4,Math.min(right-left+1,bottom-top+1)/3));
    const cross=-(px-x)*dy+(py-y)*dx;
    const band=widths.find(b=>b.bin===bin);
    if(band){band.min=Math.min(band.min,cross);band.max=Math.max(band.max,cross);}
    else widths.push({bin,min:cross,max:cross});
  }
  widths.sort((a,b)=>a.bin-b.bin);
  const transverse=widths.map(b=>Math.round(b.max-b.min+1));
  const gaps=peaks.slice(1).map((p,i)=>Math.round(Math.hypot(p.x-peaks[i].x,p.y-peaks[i].y)));
  const blank=Math.round(100*(1-n/(w*h)));
  const revisions=[
    ['Điểm nhấn',groups[2][1]],
    ['Đường bao',directional?'Thử xoay cành ngoài cùng theo trục khối rồi nhìn lại từ chính diện. Giữ nhánh giúp kéo dài phom.':'Xoay từng nhánh ở rìa trước khi cắt để thấy nhánh nào làm mất dáng viền.'],
    ['Khoảng thở',blank<35?'Tách nhẹ hai cụm đang chạm nhau để mở khe sáng và phân biệt lớp trước với lớp sau.':'Xem khoảng hở giữa các cụm ở góc trưng bày. Nếu hai cụm rời nhau, thử một nhánh chuyển tiếp mảnh để nối hướng.'],
    ['Cân bằng',shifted?'Thử hạ một cụm phụ ở phía đối diện để kiểm tra đối trọng mà vẫn giữ được dáng lệch.':'Nếu muốn thêm chuyển động cho khối giữa, thử xoay một nhánh phụ ra ngoài và so sánh hai góc nhìn.']
  ];
  const sections=[
    ['1. Hình bao tổng thể',lines[0]+' '+(clipped?'Biên chạm mép ảnh.':'Đường biên ước lượng nằm trong khung ảnh.')],
    ['2. Thứ bậc thị giác',(focal?'Dấu chữ thập chỉ vùng ứng viên cho điểm nhấn chính.':'Chưa thấy một vùng tương phản nổi trội.')+' Các vùng viền phụ có thể là lớp nâng đỡ. Đối chiếu với hoa phụ, lá đệm và nền trên ảnh gốc.'],
    ['3. Dòng chảy thị giác',lines[3]+' Mật độ viền tương phản trong chủ thể khoảng '+density+'%. '+(path.length?'Đường nối các vùng viền theo trục chính gợi ý hướng chuyển giữa các cụm.':'Chưa đủ tín hiệu để nối thành đường dẫn.')],
    ['4. Nhịp điệu thị giác',lines[2]+' Bề rộng của khối qua các lát cắt liên tiếp theo trục là '+transverse.join(' · ')+' px. '+(gaps.length?'Các vòng biểu thị lượng chi tiết viền tại từng vùng. Khoảng cách giữa các vùng lần lượt là '+gaps.join(' · ')+' px trên ảnh phân tích. Đối chiếu với nhịp bông lớn, bông nhỏ và khoảng nghỉ.':'Chưa đủ vùng riêng biệt để đối chiếu nhịp lặp.')],
    ['5. Tỷ lệ, trọng tâm và cân bằng',lines[1]+' Độ lệch ngang so với trục giữa bằng '+Math.round(100*Math.abs(x/w-.5))+'% chiều rộng ảnh. Tỷ lệ cao/rộng '+ratio.toFixed(2)+'.'],
    ['6. Điểm mạnh và điểm yếu',groups[0][0]+': '+groups[0][1],groups[1][0]+': '+groups[1][1]],
    ['7. Phương án chỉnh sửa',...revisions.map(([label,body])=>label+' · '+body)]
  ];
  lines.push(focal?'Dấu chữ thập chỉ vùng tương phản nổi bật ước lượng.':'Chưa xác định được điểm nhấn tương phản rõ.');
  return {x,y,mask,focal,groups:sections,peaks,path,directional,angle:.5*Math.atan2(2*c,a-b),lines};
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
      if(input.value==='center' && result.focal){
        const {x:fx,y:fy}=result.focal;
        ctx.moveTo(fx-9,fy);ctx.lineTo(fx+9,fy);ctx.moveTo(fx,fy-9);ctx.lineTo(fx,fy+9);
        ctx.strokeStyle='white';ctx.lineWidth=5;ctx.stroke();
        ctx.strokeStyle='#79283d';ctx.lineWidth=2;
      }
      if(input.value==='center'){ctx.beginPath();ctx.strokeStyle='#e39a39';ctx.lineWidth=2;ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();ctx.beginPath();} 
      if(input.value==='center') ctx.arc(x,y,6,0,2*Math.PI);
      if(input.value==='grid') for(const t of [1/3,2/3]){
        ctx.moveTo(w*t,0);ctx.lineTo(w*t,h);ctx.moveTo(0,h*t);ctx.lineTo(w,h*t);
      }
      if(input.value==='rhythm'){
        ctx.strokeStyle='#326e69';
        for(const p of result.peaks){ctx.moveTo(p.x+p.r,p.y);ctx.arc(p.x,p.y,p.r,0,2*Math.PI);}
      }
      if(input.value==='axis' && result.path.length){
        ctx.strokeStyle='#b85530';
        result.path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
        ctx.stroke();ctx.beginPath();ctx.setLineDash([4,5]);
      }
      if(input.value==='axis' && result.directional){
        const len=Math.min(w,h)*.35,dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;
        ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);
      }
      ctx.stroke();ctx.setLineDash([]);
    }
  }
  function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
  const reference=element('details','');
  reference.append(element('summary','Tham chiếu bài học Học viện'));
  const source=element('a','Mở Học viện Kim Flora');
  source.href='https://kim-flora.github.io/hocvienhoakimflora/guest.html';
  source.target='_blank';source.rel='noopener noreferrer';
  reference.append(source,element('p','Dán đoạn bài muốn đối chiếu. Mỗi dòng là một trích đoạn dùng cho các ảnh trong phiên này.'));
  const courses=['Bố cục & Thiết kế','Phối màu & Chọn màu'].map(label=>{
    const field=element('textarea','');
    const caption=element('label',label);
    caption.append(field);reference.append(caption);
    field.onchange=()=>{if(result)renderFindings();};
    return {label,field};
  });
  get('drop').after(reference);
  function renderFindings(){
    const masked=new Uint8ClampedArray(pixels.data);
    for(let p=0;p<result.mask.length;p++)if(!result.mask[p])masked[p*4+3]=0;
    const palette=extractPalette(masked,4,pixels.width);
    const total=palette.reduce((n,c)=>n+c.weight,0);
    const light=palette.map(c=>hexToHsl(c.hex).lightness);
    const spread=light.length?Math.max(...light)-Math.min(...light):0;
    const groups=[['Phối màu trên chủ thể',palette.length?palette.map(c=>c.hex+' ('+Math.round(100*c.weight/total)+'%)').join(' · '):'Chưa đủ mẫu màu.',
      spread>.35?'Các mảng có độ sáng tối cách biệt. Đối chiếu vùng sáng nhất và tối nhất với cụm hoa muốn nhấn.':'Các mảng có độ sáng tối gần nhau. Kiểm tra lớp trước và lớp sau ở vị trí hai màu tiếp xúc.']];
    const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
    for(const course of courses){
      const terms=course.label.startsWith('Bố')?[result.directional?'duong dan':'hinh bao',result.focal?'diem nhan':'thu bac','trong tam','silhouette']:[spread>.35?'tuong phan':'sang toi','value','sac do','chu dao'];
      const excerpts=course.field.value.split(/\n/).map(line=>line.trim()).filter(Boolean);
      if(!excerpts.length){
        groups.push([course.label,'Chủ đề đối chiếu: '+(course===courses[0]?(result.directional?'đường dẫn và trọng tâm':'hình bao và thứ bậc thị giác'):(spread>.35?'tương phản sáng tối':'sắc độ và màu chủ đạo'))+'.']);
        continue;
      }
      const ranked=excerpts.map(text=>({title:'',text})).map(lesson=>{
        const title=normalize(lesson.title),body=normalize(lesson.text);
        return {lesson,weight:terms.reduce((n,k)=>n+(title.includes(k)?4:0)+(body.includes(k)?1:0),0)};
      }).filter(item=>item.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,2);
      groups.push([course.label,...(ranked.length?ranked.map(({lesson})=>lesson.text):['Chưa tìm thấy mục bài học khớp với dấu hiệu trong ảnh.'])]);
    }
    result.linkedGroups=groups;
    get('findings').replaceChildren(...[...result.groups,...groups].flatMap(([title,...body])=>[element('h3',title),...body.map(t=>element('p',t))]));
  }
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
      renderFindings();
      get('layers').hidden=get('result').hidden=false;draw();status('Đã phân tích ảnh.');
    } catch {if(ticket===sequence)status('Chưa đọc được ảnh. Hãy chọn tệp JPG, PNG hoặc WebP.');}
    finally{URL.revokeObjectURL(url);}
  }
  for(const button of get('samples').querySelectorAll('button')){
    button.onclick=()=>open(sampleFile(Number(button.dataset.sample),button.textContent));
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
  function reportText(){return [...result.groups.flat(),...(result.linkedGroups||[]).flat(),get('note').value.trim()].filter(Boolean).join('\n');}
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
