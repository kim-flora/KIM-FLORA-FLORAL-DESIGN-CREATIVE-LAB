import { sampledPalette } from './image-palette.js';

self.onmessage = ({data:{bitmap, count, flowers}}) => {
  try {
    self.postMessage({colors:sampledPalette(bitmap, count, flowers)});
  } catch (error) {
    self.postMessage({error:error.message});
  } finally {
    bitmap.close();
  }
};
