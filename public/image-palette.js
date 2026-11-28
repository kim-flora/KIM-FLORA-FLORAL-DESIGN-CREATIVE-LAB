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
    for (let y = 0; y < canvas.height; y++) {
      const row = Math.floor(y * thumb.height / canvas.height) * thumb.width;
      for (let x = 0; x < canvas.width; x++) {
        if (background[row + Math.floor(x * thumb.width / canvas.width)]) {
          pixels.data[(y * canvas.width + x) * 4 + 3] = 0;
        }
      }
    }
  }
  const colors = extractPalette(pixels.data, count, pixels.width);
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
