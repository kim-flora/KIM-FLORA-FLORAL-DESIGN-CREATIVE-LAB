import { flowerLeafSamples } from './moodboard-mask.js';
import { extractPalette } from './color-model.js';
export function sampleCanvas(img){
    const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(img.width,img.height));
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas;
}
export function sampledPalette(canvas,count,flowers=false){
    const ctx=canvas.getContext('2d');
    const summarize=colors=>{const total=colors.reduce((n,c)=>n+c.weight,0);return colors.map(c=>({hex:c.hex,percent:Math.round(100*c.weight/total)}));};
    if(!flowers){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return summarize(extractPalette(pixels.data,count,pixels.width));}
    const thumb=document.createElement('canvas');const shrink=Math.min(1,180/Math.max(canvas.width,canvas.height));
    thumb.width=Math.max(1,Math.round(canvas.width*shrink));thumb.height=Math.max(1,Math.round(canvas.height*shrink));
    const small=thumb.getContext('2d');small.drawImage(canvas,0,0,thumb.width,thumb.height);
    const samples=flowerLeafSamples(small.getImageData(0,0,thumb.width,thumb.height).data,thumb.width,thumb.height,1);
    let subject=[];
    if(samples.length>thumb.width*thumb.height*.02&&samples.length<thumb.width*thumb.height*.91){
      const rgba=new Uint8ClampedArray(samples.length*4);
      samples.forEach((c,i)=>rgba.set([...c,255],4*i));
      subject=summarize(extractPalette(rgba,count,samples.length));
    }
    return subject;
}
