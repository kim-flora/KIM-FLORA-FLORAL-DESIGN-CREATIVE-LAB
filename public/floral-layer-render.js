function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
const clamp=v=>Math.max(0,Math.min(1,v));
function hsl(r,g,b){
  const high=Math.max(r,g,b),low=Math.min(r,g,b),d=high-low,l=(high+low)/2;
  return [d?((high===r?(g-b)/d:high===g?(b-r)/d+2:(r-g)/d+4)+6)%6:0,d?d/(1-Math.abs(2*l-1)):0,l];
}
function channel(h,s,l,n){
  const k=(n+h*2+12)%12;
  return l-Math.min(l,1-l)*s*Math.max(-1,Math.min(k-3,9-k,1));
}
function cutout(img,p,c={}){
  const out=surface(p.w,p.h),ctx=out.getContext('2d');ctx.drawImage(img,-p.x,-p.y);
  const frame=ctx.getImageData(0,0,p.w,p.h),d=frame.data;
  const target=c.hex?hsl(...c.hex.match(/\w\w/g).map(k=>parseInt(k,16)/255)):null;
  const adjust=target||Object.values(c).some(Boolean);
  const contrast=2**((c.contrast||0)/100);
  let mean=0,total=0;
  if(target)for(let i=0;i<p.alpha.length;i++){const j=i*4,a=p.alpha[i]*d[j+3];mean+=a*(Math.max(d[j],d[j+1],d[j+2])+Math.min(d[j],d[j+1],d[j+2]))/510;total+=a;}
  mean/=total||1;
  for(let i=0;i<p.alpha.length;i++){
    const j=i*4;d[j+3]*=p.alpha[i]/255;if(!d[j+3]||!adjust)continue;
    let [h,s,l]=hsl(d[j]/255,d[j+1]/255,d[j+2]/255);
    if(target){h=target[0];s=target[1]*(.52+.48*s);l=clamp(l+.8*(target[2]-mean)*4*l*(1-l));}
    h=(h+(c.hue||0)/60+6)%6;s=clamp(s*(1+(c.saturation||0)/100));
    const lift=((c.shadows||0)*(1-l)**2+(c.highlights||0)*l*l)/100;
    l=clamp(.5+(l-.5)*contrast+(c.brightness||0)/230+lift*.52);
    const t=(c.temperature||0)*.0014*4*l*(1-l);
    d[j]=255*(channel(h,s,l,0)+t);d[j+1]=255*channel(h,s,l,8);d[j+2]=255*(channel(h,s,l,4)-t);
  }
  ctx.putImageData(frame,0,0);return out;
}
export function pose(l,p){
  return new DOMMatrix().translate(p.x+p.w/2+(l.x||0),p.y+p.h/2+(l.y||0)).rotate(l.angle||0)
    .scale((l.scale||1)*(l.mirrorX?-1:1),(l.scale||1)*(l.mirrorY?-1:1)).translate(-p.w/2,-p.h/2);
}
export function moved(l){return !!(l.x||l.y||l.angle||l.mirrorX||l.mirrorY||(l.scale&&l.scale!==1));}
// Extend reliable neighboring pixels inward. Continue source patches along the boundary
// normal when possible, blending competing patches where fronts meet.
function repair(frame,hole,excluded){
  const {width:w,height:h,data:d}=frame,n=w*h,source=d.slice(),donor=new Int32Array(n).fill(-1),queue=new Int32Array(n);let end=0;
  function neighbors(i,fn){const x=i%w;if(x)fn(i-1);if(x+1<w)fn(i+1);if(i>=w)fn(i-w);if(i<n-w)fn(i+w);}
  for(let i=0;i<n;i++)if(hole[i])neighbors(i,j=>{if(donor[i]<0&&!excluded[j]&&source[4*j+3]){donor[i]=j;queue[end++]=i;}});
  // If the mask touches another selected object, search across that object for a background donor.
  if(!end){for(let i=0;i<n;i++)if(!excluded[i]&&source[4*i+3]){donor[i]=i;queue[end++]=i;}}
  for(let head=0;head<end;head++){const i=queue[head];neighbors(i,j=>{if(donor[j]<0&&(hole[j]||excluded[j])){donor[j]=donor[i];queue[end++]=j;}});}
  for(let i=0;i<n;i++)if(hole[i]&&donor[i]>=0){
    const sum=[0,0,0,0];let weight=0;
    function sample(j){const a=donor[j];if(a<0)return;
      const ax=a%w,ay=Math.floor(a/w),xx=2*ax-i%w,yy=2*ay-Math.floor(i/w);
      let k=xx>=0&&xx<w&&yy>=0&&yy<h&&!excluded[yy*w+xx]&&source[(yy*w+xx)*4+3]?yy*w+xx:a;
      if(Math.max(...[0,1,2].map(c=>Math.abs(source[4*k+c]-source[4*a+c])))>36)k=a;
      for(let t=0;t<4;t++)sum[t]+=source[4*k+t];weight++;}
    sample(i);neighbors(i,sample);
    for(let t=0;t<4;t++)d[i*4+t]=sum[t]/weight;
  }
}
export const layerBlendModes = {
  'source-over':'Bình thường', multiply:'Nhân tối', screen:'Hòa sáng', overlay:'Tăng tương phản',
  'soft-light':'Ánh sáng mềm', darken:'Lấy màu tối hơn', lighten:'Lấy màu sáng hơn'
};
const blendMode = layer => Object.hasOwn(layerBlendModes,layer.blend) ? layer.blend : 'source-over';
const layerOpacity = layer => Number.isFinite(layer.opacity) ? clamp(layer.opacity / 100) : 1;
export const hasLayerComposite = layer => layerOpacity(layer)!==1 || blendMode(layer)!=='source-over';

export function layerRenderer(parts){
  let lastImg,baseKey,base,out,tiles=new Map();
  return (img,s)=>{
    if(lastImg!==img){lastImg=img;baseKey=null;out=null;tiles.clear();}
    const layers=s.layers||[],holes=[...(s.removed||[]),...layers.filter(l=>!l.copy&&(moved(l)||hasLayerComposite(l))).map(l=>l.key)];
    const w=img.naturalWidth,h=img.naturalHeight;
    out??=surface(w,h);
    const ctx=out.getContext('2d');
    ctx.resetTransform();
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,w,h);
    if(!holes.length&&!s.hideBase&&layers.every(l=>!l.copy&&l.visible)){
      ctx.drawImage(img,0,0);
      for(const l of layers){if(!l.color)continue;
        const p=parts.get(l.key),tile=cutout(img,p,l.color),colors=tile.getContext('2d').getImageData(0,0,p.w,p.h).data;
        const frame=ctx.getImageData(p.x,p.y,p.w,p.h);
        for(let i=0;i<p.alpha.length;i++){const a=p.alpha[i]/255;if(!a)continue;
          for(let c=0;c<3;c++){const j=i*4+c;frame.data[j]+=(colors[j]-frame.data[j])*a;}}
        ctx.putImageData(frame,p.x,p.y);
      }
      return out;
    }
    const key=JSON.stringify([holes,s.hideBase,layers.filter(l=>!l.copy).map(l=>[l.key,l.visible,moved(l)])]);
    if(key!==baseKey){
      base=surface(w,h);const ctx=base.getContext('2d');
      if(!s.hideBase){
        ctx.drawImage(img,0,0);
        if(holes.length||layers.some(l=>!l.visible&&!l.copy)){
          const frame=ctx.getImageData(0,0,w,h),hole=new Uint8Array(w*h),excluded=new Uint8Array(w*h);
          function each(k,fn){const p=parts.get(k);for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++){const a=p.alpha[y*p.w+x];if(a)fn((p.y+y)*w+p.x+x,a);}}
          for(const k of holes)each(k,i=>{hole[i]=excluded[i]=1;});
          for(const l of layers)each(l.key,i=>{excluded[i]=1;});
          if(holes.length)repair(frame,hole,excluded);
          for(const l of layers)if(!l.copy&&!l.visible&&!moved(l)&&!hasLayerComposite(l))each(l.key,(i,a)=>frame.data[4*i+3]*=1-a/255);
          ctx.putImageData(frame,0,0);
        }
      }
      baseKey=key;
    }
    ctx.drawImage(base,0,0);
    for(const l of layers){if(!l.visible)continue;
      const p=parts.get(l.key),key=JSON.stringify([l.key,l.color]);let tile=tiles.get(l.id);
      if(tile?.key!==key){tile={key,image:cutout(img,p,l.color)};tiles.set(l.id,tile);}
      const m=pose(l,p);
      ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
      ctx.globalAlpha=layerOpacity(l);
      ctx.globalCompositeOperation=blendMode(l);
      ctx.drawImage(tile.image,0,0);
    }
    return out;
  };
}
