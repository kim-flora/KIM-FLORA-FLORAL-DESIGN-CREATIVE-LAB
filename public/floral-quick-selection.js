// Connected brush growth. New samples can cross an internal petal boundary on
// the next stroke, while accumulated edge cost stops growth at strong borders.
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
let last,source;
function imagePixels(img){
  if(last===img)return source;
  const scale=Math.min(1,1152/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=make(Math.max(1,Math.round(img.naturalWidth*scale)),Math.max(1,Math.round(img.naturalHeight*scale)));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  source=ctx.getImageData(0,0,canvas.width,canvas.height);last=img;return source;
}
export function growBrush(img,points,diameter){
  const {width:w,height:h,data:d}=imagePixels(img),sx=w/img.naturalWidth,sy=h/img.naturalHeight;
  const radius=Math.max(.6,diameter*sx/2),seeds=[],seen=new Set(),palette=[];
  let x0=w,x1=0,y0=h,y1=0;
  function seed(x,y){
    const k=y*w+x;if(x<0||y<0||x>=w||y>=h||seen.has(k)||d[4*k+3]<24)return;
    seen.add(k);seeds.push(k);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  function stamp(x,y){
    const r=Math.max(.5,radius*.58);seed(Math.floor(x),Math.floor(y));
    for(let j=Math.ceil(y-r);j<=y+r;j++)for(let i=Math.ceil(x-r);i<=x+r;i++)if((i-x)**2+(j-y)**2<=r*r)seed(i,j);
  }
  for(let j=0;j<points.length;j++){
    const a=points[Math.max(0,j-1)],b=points[j],steps=Math.max(1,Math.ceil(Math.hypot((a.x-b.x)*sx,(a.y-b.y)*sy)/Math.max(1,radius*.55)));
    for(let n=1;n<=steps;n++)stamp((a.x+(b.x-a.x)*n/steps)*sx,(a.y+(b.y-a.y)*n/steps)*sy);
  }
  if(!seeds.length)return null;
  function diff(i,j){return Math.max(Math.abs(d[4*i]-d[4*j]),Math.abs(d[4*i+1]-d[4*j+1]),Math.abs(d[4*i+2]-d[4*j+2]));}
  for(let i=0;i<seeds.length&&palette.length<28;i+=Math.max(1,Math.floor(seeds.length/300)))
    if(!palette.some(p=>diff(p,seeds[i])<12))palette.push(seeds[i]);
  const pad=Math.ceil(Math.max(28,radius*16,Math.min(w,h)*.15)),left=Math.max(0,x0-pad),top=Math.max(0,y0-pad),right=Math.min(w-1,x1+pad),bottom=Math.min(h-1,y1+pad);
  const rw=right-left+1,rh=bottom-top+1,budget=190,buckets=Array.from({length:budget+1},()=>[]),cost=new Uint8Array(rw*rh).fill(255),tone=new Int16Array(rw*rh).fill(-1);
  const local=k=>(Math.floor(k/w)-top)*rw+k%w-left;
  for(const k of seeds){cost[local(k)]=0;buckets[0].push(k);}
  function visit(k,j,prev){
    const i=local(j);if(cost[i]<=prev||d[4*j+3]<24)return;
    let color=tone[i];if(color<0){color=255;for(const p of palette)color=Math.min(color,diff(p,j));tone[i]=color;}
    const edge=diff(k,j);
    const next=prev+1+Math.round(Math.max(0,edge-7)**1.55*.64+Math.max(0,color-23)**1.3*.2);
    if(next<=budget&&next<cost[i]){cost[i]=next;buckets[next].push(j);}
  }
  for(let level=0;level<=budget;level++)for(const k of buckets[level]){
    if(cost[local(k)]!==level)continue;
    const x=k%w,y=Math.floor(k/w);if(x>left)visit(k,k-1,level);if(x<right)visit(k,k+1,level);
    if(y>top)visit(k,k-w,level);if(y<bottom)visit(k,k+w,level);
  }
  const tile=make(rw,rh),ctx=tile.getContext('2d'),f=ctx.createImageData(rw,rh);
  for(let i=0;i<cost.length;i++)if(cost[i]<=budget){const j=i*4;f.data.set([16,167,144,Math.min(255,(budget+1-cost[i])*18)],j);}
  ctx.putImageData(f,0,0);return {tile,x:left/sx,y:top/sy,w:rw/sx,h:rh/sy};
}
