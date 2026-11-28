import { flowerLeafSamples } from './moodboard-mask.js';
import { allocate, extractPalette } from './color-model.js';

function surface(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  return Object.assign(document.createElement('canvas'), {width, height});
}

export function sampledPalette(img, count, flowers) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, 768 / Math.max(width, height));
  const canvas = surface(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (flowers) {
    const shrink = Math.min(1, 180 / Math.max(canvas.width, canvas.height));
    const thumb = surface(Math.max(1, Math.round(canvas.width * shrink)), Math.max(1, Math.round(canvas.height * shrink)));
    const small = thumb.getContext('2d', {willReadFrequently:true});
    small.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const data = small.getImageData(0, 0, thumb.width, thumb.height).data;
    const background = flowerLeafSamples(data, thumb.width, thumb.height, 1, true);
    let foreground = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 128 && !background[i / 4]) foreground++;
    }
    if (foreground < Math.max(1, thumb.width * thumb.height * .008)) return [];
    const darkNeutral = (data, index) => {
      const r=data[index],g=data[index+1],b=data[index+2];
      return Math.max(r,g,b)<68 && Math.max(r,g,b)-Math.min(r,g,b)<19;
    };
    let edge=0,darkEdge=0;
    for(let y=0;y<thumb.height;y++)for(let x=0;x<thumb.width;x++){
      if(x&&y&&x<thumb.width-1&&y<thumb.height-1)continue;
      const i=4*(y*thumb.width+x);
      edge++;
      if(data[i+3]>=128&&darkNeutral(data,i))darkEdge++;
    }
    const darkBackdrop=darkEdge>edge*.55;
    for (let y = 0; y < canvas.height; y++) {
      const row = Math.floor(y * thumb.height / canvas.height) * thumb.width;
      for (let x = 0; x < canvas.width; x++) {
        const column=Math.floor(x*thumb.width/canvas.width), index=(y*canvas.width+x)*4;
        const nearBackdrop=darkBackdrop&&darkNeutral(pixels.data,index)&&(
          (column>0&&background[row+column-1])||(column+1<thumb.width&&background[row+column+1])||
          (row>0&&background[row+column-thumb.width])||
          (row+thumb.width<background.length&&background[row+column+thumb.width])
        );
        if(background[row+column]||nearBackdrop)pixels.data[index+3]=0;
      }
    }
  }
  const colors = extractPalette(pixels.data, count, pixels.width, flowers);
  const percentages = allocate(colors.map(color => color.weight), 100);
  return colors.map(({hex}, index) => ({hex, percent:percentages[index]}));
}

export async function extractImagePalette(img, count, flowers, signal) {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' ||
      typeof createImageBitmap !== 'function') {
    signal.throwIfAborted();
    return sampledPalette(img, count, flowers);
  }
  try {
    const bitmap = await createImageBitmap(img);
    try {
      signal.throwIfAborted();
      const worker = new Worker(new URL('./image-palette-worker.js', import.meta.url), {type:'module'});
      const abort = () => worker.terminate();
      signal.addEventListener('abort', abort, {once:true});
      try {
        return await new Promise((resolve, reject) => {
          const finishAbort = () => reject(signal.reason);
          signal.addEventListener('abort', finishAbort, {once:true});
          worker.onmessage = ({data}) => {
            signal.removeEventListener('abort', finishAbort);
            if (data.error) reject(new Error(data.error));
            else resolve(data.colors);
          };
          worker.onerror = error => {
            signal.removeEventListener('abort', finishAbort);
            reject(error);
          };
          worker.postMessage({bitmap, count, flowers}, [bitmap]);
        });
      } finally {
        signal.removeEventListener('abort', abort);
        worker.terminate();
      }
    } finally {
      bitmap.close();
    }
  } catch {
    signal.throwIfAborted();
    return sampledPalette(img, count, flowers);
  }
}
