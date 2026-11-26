export async function cpuSegmenter(){
  const worker=new Worker('/selection-ai/floral-cpu-worker.js');
  let chain=Promise.resolve();
  function run(data,transfer=[]){
    const next=chain.then(()=>new Promise((resolve,reject)=>{
      worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data);
      worker.onerror=e=>reject(Error(e.message||'Không khởi động được bộ nhận diện CPU.'));
      worker.postMessage(data,transfer);
    }));chain=next.catch(()=>{});return next;
  }
  let width,height;
  try{({width,height}=await run({init:true}));}catch(e){worker.terminate();throw e;}
  const canvas=Object.assign(document.createElement('canvas'),{width,height}),ctx=canvas.getContext('2d',{willReadFrequently:true});
  return {async segment(view,{keypoint},consume){
    ctx.drawImage(view,0,0,width,height);const rgb=ctx.getImageData(0,0,width,height).data;
    const input=new Float32Array(rgb.length),cx=keypoint.x*width,cy=keypoint.y*height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=4*(y*width+x);input[i]=rgb[i]/255;input[i+1]=rgb[i+1]/255;input[i+2]=rgb[i+2]/255;
      input[i+3]=Math.exp(-((x-cx)**2+(y-cy)**2)/50);
    }
    const {probabilities,w,h}=await run({input},[input.buffer]);
    consume({confidenceMasks:[{width:w,height:h,getAsFloat32Array:()=>probabilities}]});
  }};
}
