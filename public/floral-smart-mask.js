const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
let engine,cpu;
function fallback(){
  return cpu??=import('./floral-cpu-mask.js').then(m=>m.cpuSegmenter()).catch(error=>{cpu=null;throw error;});
}
function segmenter(){
  return engine??=(async()=>{
    const probe=document.createElement('canvas').getContext('webgl2');
    if(!probe)return fallback();
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const {InteractiveSegmenter,FilesetResolver}=await import('/selection-ai/vision.mjs');
    return InteractiveSegmenter.createFromOptions(await FilesetResolver.forVisionTasks('/selection-ai/wasm'),{
      baseOptions:{modelAssetPath:'/selection-ai/magic_touch.tflite',delegate:'CPU'},outputConfidenceMasks:true
    });
  })().catch(()=>{engine=null;return fallback();});
}
function rgbDistance(d,i,j){return (d[i]-d[j])**2+(d[i+1]-d[j+1])**2+(d[i+2]-d[j+2])**2;}
export function refine(img,mask,x=0,y=0){
  const w=mask.width,h=mask.height,ctx=mask.getContext('2d'),frame=ctx.getImageData(0,0,w,h),d=frame.data,original=d.slice();
  const source=canvas(w,h).getContext('2d');source.drawImage(img,-x,-y);
  const rgb=source.getImageData(0,0,w,h).data;
  for(let row=1;row<h-1;row++)for(let col=1;col<w-1;col++){
    const i=(row*w+col)*4,a=original[i+3];
    if((a===0||a===255)&&[i-4,i+4,i-4*w,i+4*w].every(j=>original[j+3]===a))continue;
    let sum=a*2,weight=2;
    for(const offset of [-w-1,-w,-w+1,-1,1,w-1,w,w+1]){
      const j=i+offset*4,v=1/(1+rgbDistance(rgb,i,j)/160);
      weight+=v;sum+=v*original[j+3];
    }
    d[i]=16;d[i+1]=167;d[i+2]=144;d[i+3]=Math.min(rgb[i+3],sum/weight);
  }
  ctx.putImageData(frame,0,0);return mask;
}
export async function infer(img,points,isCurrent=()=>true){
  const check=()=>{if(!isCurrent())throw new DOMException('Selection changed','AbortError');};
  const W=img.naturalWidth,H=img.naturalHeight;
  let l=W,t=H,r=0,b=0;for(const p of points){l=Math.min(l,p.x);r=Math.max(r,p.x);t=Math.min(t,p.y);b=Math.max(b,p.y);}
  if(r-l<3||b-t<3)throw Error('Khoanh một vùng rộng hơn quanh đối tượng.');
  const margin=Math.max(10,.32*Math.max(r-l,b-t)),x=Math.max(0,Math.floor(l-margin)),y=Math.max(0,Math.floor(t-margin));
  const w=Math.min(W,Math.ceil(r+margin))-x,h=Math.min(H,Math.ceil(b+margin))-y;
  if(w<1||h<1)throw Error('Vùng khoanh nằm ngoài ảnh.');
  const scale=Math.min(1,720/Math.max(w,h)),view=canvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))),vw=view.width,vh=view.height;
  const ctx=view.getContext('2d');ctx.drawImage(img,x,y,w,h,0,0,vw,vh);
  const roi=canvas(vw,vh),rc=roi.getContext('2d');rc.beginPath();for(const p of points)rc.lineTo((p.x-x)*vw/w,(p.y-y)*vh/h);rc.fill();
  const poly=rc.getImageData(0,0,vw,vh).data;
  // Test several interior prompts, then rank actual instance masks by overlap with the user's loop.
  let cx=0,cy=0,n=0;for(let i=0;i<vw*vh;i++)if(poly[4*i+3]>127){cx+=i%vw;cy+=Math.floor(i/vw);n++;}
  if(!n)throw Error('Khoanh một vòng quanh đối tượng.');
  cx/=n;cy/=n;
  const rgb=ctx.getImageData(0,0,vw,vh).data,outer=new Uint32Array(512);
  const bin=i=>(rgb[4*i]>>5)*64+(rgb[4*i+1]>>5)*8+(rgb[4*i+2]>>5);
  for(let i=0;i<vw*vh;i++)if(poly[4*i+3]<10)outer[bin(i)]++;
  const seeds=[];for(let pass=0;pass<3;pass++){let best=-1,score=-Infinity;
    for(let j=1;j<vh-1;j+=3)for(let i=1;i<vw-1;i+=3){const k=j*vw+i;if(poly[k*4+3]<240)continue;
      const dist=Math.hypot((i-cx)/vw,(j-cy)/vh);
      if(seeds.some(p=>Math.hypot((p.x-i)/vw,(p.y-j)/vh)<.12))continue;
      const value=-dist-(pass?Math.log1p(outer[bin(k)])*.09:0);
      if(value>score){score=value;best=k;}}
    if(best>=0)seeds.push({x:best%vw,y:Math.floor(best/vw)});
  }
  check();
  let model=await segmenter(),bestMask,bestScore=-1;
  check();
  for(const seed of seeds){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    check();
    const prompt={keypoint:{x:(seed.x+.5)/vw,y:(seed.y+.5)/vh}};
    const consume=result=>{
      if(!isCurrent())return;
      const masks=result.confidenceMasks,mp=masks[masks.length-1],probs=mp.getAsFloat32Array(),mw=mp.width,mh=mp.height;
      let inside=0,outside=0;for(let i=0;i<probs.length;i++)if(probs[i]>.5){
        const k=Math.floor(Math.floor(i/mw)*vh/mh)*vw+Math.floor((i%mw)*vw/mw);
        if(poly[k*4+3]>127)inside++;else outside++;
      }
      const score=inside/(n*mw*mh/(vw*vh)+outside*2);
      if(inside>2&&score>bestScore){bestScore=score;bestMask=canvas(mw,mh);const c=bestMask.getContext('2d'),f=c.createImageData(mw,mh);
        for(let i=0;i<probs.length;i++){const j=i*4;f.data[j]=16;f.data[j+1]=167;f.data[j+2]=144;f.data[j+3]=255*Math.max(0,Math.min(1,(probs[i]-.33)/.34));}c.putImageData(f,0,0);}
    };
    try{await model.segment(view,prompt,consume);}catch(error){check();const cpuModel=await fallback();check();if(model===cpuModel)throw error;model=cpuModel;engine=Promise.resolve(model);await model.segment(view,prompt,consume);}
  }
  check();
  if(!bestMask||bestScore<.035)throw Error('AI chưa xác định được đối tượng. Hãy khoanh sát hơn.');
  const out=canvas(w,h);out.getContext('2d').drawImage(bestMask,0,0,w,h);return {mask:refine(img,out,x,y),x,y};
}
// Find spatially separate candidates using the selected object's color distribution.
// Each candidate is segmented again; similar-colored pixels alone never become the mask.
export function candidates(img,mask){
  const scale=Math.min(1,180/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas(w,h).getContext('2d');ctx.drawImage(img,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data;ctx.clearRect(0,0,w,h);ctx.drawImage(mask,0,0,w,h);const sel=ctx.getImageData(0,0,w,h).data;
  const hist=new Uint32Array(512),tag=i=>(data[4*i]>>5)*64+(data[4*i+1]>>5)*8+(data[4*i+2]>>5);let area=0;
  for(let i=0;i<w*h;i++)if(sel[4*i+3]>128){hist[tag(i)]++;area++;}
  const eligible=Uint8Array.from({length:w*h},(_,i)=>sel[4*i+3]<20&&data[4*i+3]>128&&hist[tag(i)]>Math.max(1,area*.015)?1:0);
  const picks=[];for(let i=0;i<w*h;i++)if(eligible[i]){const queue=[i];eligible[i]=0;let l=w,r=0,t=h,b=0;
    for(let k=0;k<queue.length;k++){const j=queue[k],x=j%w,y=Math.floor(j/w);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
      for(const n of [x?j-1:-1,x+1<w?j+1:-1,j-w,j+w])if(eligible[n]){eligible[n]=0;queue.push(n);}}
    if(queue.length>area*.1&&queue.length<area*2.8&&r-l>=3&&b-t>=3)picks.push({delta:Math.abs(queue.length-area),points:[[l,t],[r+1,t],[r+1,b+1],[l,b+1]].map(([x,y])=>({x:x/scale,y:y/scale}))});
  }
  return picks.sort((a,b)=>a.delta-b.delta).slice(0,4).map(v=>v.points);
}
