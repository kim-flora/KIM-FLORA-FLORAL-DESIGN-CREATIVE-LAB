import {flowerLeafSamples} from './moodboard-mask.js';
import {pose} from './floral-layer-render.js';

const surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const quant=(r,g,b)=>(r>>4)*256+(g>>4)*16+(b>>4);
export function effectControls(aside,env){
  const panel=document.createElement('fieldset');panel.className='flower-fx';aside.append(panel);
  panel.innerHTML='<legend>Ánh sáng và hiệu ứng</legend><button type="button">Douyin Dark Floral</button>';
  const specs={light:['Ánh sáng chủ thể',-80,80],background:['Ánh sáng nền',-90,80],shadow:['Bóng đổ',0,100],offset:['Độ lệch bóng',-100,100],soft:['Độ mềm bóng',0,100],blur:['Mờ hậu cảnh',0,100],depth:['Chiều sâu',0,100],edge:['Tối viền',0,100],opacity:['Độ phủ màu (%)',0,100]};
  const defaults={offset:25,soft:35,tint:'#70566F'};
  const fields={};
  for(const [k,[title,min,max]] of Object.entries(specs)){
    const label=document.createElement('label');label.textContent=title;
    const out=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.dataset.fx=k;
    label.append(out,input);panel.append(label);fields[k]={input,out};
    input.oninput=()=>{const e=env();(e.s.fx??={})[k]=+input.value;out.value=input.value;e.schedule();};input.onchange=()=>env().commit();
  }
  const label=document.createElement('label');label.textContent='Màu phủ';const tint=document.createElement('input');tint.type='color';label.append(tint);panel.append(label);
  tint.oninput=()=>{const e=env();(e.s.fx??={}).tint=tint.value;e.schedule();};tint.onchange=()=>env().commit();
  panel.querySelector('button').onclick=()=>{const e=env();e.s.fx={...defaults,light:8,background:-52,depth:28,edge:22,blur:9};e.commit();e.paint();};
  const note=document.createElement('small');panel.append(note);
  return ()=>{const {s,before}=env();panel.disabled=!s||before;
    const fx={...defaults,...s?.fx};for(const [k,{input,out}] of Object.entries(fields))input.value=out.value=fx[k]||0;
    tint.value=fx.tint;note.textContent=s?.layers?.length?'Chủ thể theo mặt nạ các lớp đang hiện.':'Chủ thể ước lượng từ màu ảnh. Tách lớp hoa để chỉnh chính xác.';};
}
function subjectMask(canvas,s,parts){
  const {width:w,height:h}=canvas,m=surface(w,h),ctx=m.getContext('2d');
  if(s.layers?.length){
    ctx.scale(w/s.w,h/s.h);ctx.transform(...s.m);
    for(const l of s.layers){if(!l.visible)continue;const p=parts.get(l.key),tile=surface(p.w,p.h),tc=tile.getContext('2d'),f=tc.createImageData(p.w,p.h);
      for(let i=0;i<p.alpha.length;i++)f.data[i*4+3]=p.alpha[i];tc.putImageData(f,0,0);
      ctx.save();const mat=pose(l,p);ctx.transform(mat.a,mat.b,mat.c,mat.d,mat.e,mat.f);ctx.drawImage(tile,0,0);ctx.restore();}
  }else{
    const scale=Math.min(1,190/Math.max(w,h)),sm=surface(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))),sc=sm.getContext('2d');sc.drawImage(canvas,0,0,sm.width,sm.height);
    const f=sc.getImageData(0,0,sm.width,sm.height),set=new Set(flowerLeafSamples(f.data,sm.width,sm.height,1).map(c=>quant(...c)));
    for(let i=0;i<f.data.length;i+=4){const d=f.data;d[i+3]=set.has(quant(d[i],d[i+1],d[i+2]))?d[i+3]:0;}
    sc.putImageData(f,0,0);ctx.drawImage(sm,0,0,w,h);
  }
  return m;
}
export function applyEffects(canvas,s,parts){
  const f=s.fx;if(!f||!['light','background','shadow','blur','depth','edge','opacity'].some(k=>f[k]))return;
  const {width:w,height:h}=canvas,ctx=canvas.getContext('2d'),frame=ctx.getImageData(0,0,w,h),d=frame.data;
  const mask=subjectMask(canvas,s,parts),alpha=mask.getContext('2d').getImageData(0,0,w,h).data;
  const unit=Math.min(w,h)/1000;let blurred,shadow;
  if(f.blur||f.depth){
    const bg=surface(w,h),bc=bg.getContext('2d');bc.drawImage(canvas,0,0);bc.globalCompositeOperation='destination-out';bc.drawImage(mask,0,0);
    const tmp=surface(w,h),tc=tmp.getContext('2d');tc.filter='blur('+Math.max(.5,unit*((f.blur||0)*.25+(f.depth||0)*.055))+'px)';tc.drawImage(bg,0,0);blurred=tc.getImageData(0,0,w,h).data;
  }
  if(f.shadow){const tmp=surface(w,h),tc=tmp.getContext('2d'),dx=(f.offset??25)*unit*.6;
    tc.filter='blur('+Math.max(.1,(f.soft??35)*unit*.35)+'px)';tc.drawImage(mask,dx*.65,dx);shadow=tc.getImageData(0,0,w,h).data;}
  const tint=(f.tint||'#70566F').slice(1).match(/../g).map(x=>parseInt(x,16)),opacity=(f.opacity||0)/100;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,fg=alpha[i+3]/255,bg=1-fg;
    const vignette=Math.min(1,((2*x+1)/w-1)**2+((2*y+1)/h-1)**2);
    const gain=2**(((f.light||0)*fg+((f.background||0)-(f.depth||0)*.22)*bg)/65)
      *(1-vignette*vignette*(f.edge||0)*.008)*(1-(shadow?shadow[i+3]/255:0)*bg*(f.shadow||0)*.008);
    const mix=blurred&&blurred[i+3]?bg*Math.min(1,((f.blur||0)+(f.depth||0)*.3)/18):0;
    for(let j=0;j<3;j++){const base=d[i+j]+(mix?(blurred[i+j]-d[i+j])*mix:0);d[i+j]=base*gain*(1-opacity)+tint[j]*opacity;}
  }
  ctx.putImageData(frame,0,0);
}
