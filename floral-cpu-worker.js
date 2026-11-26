// Dedicated CPU interpreter. Only fixed, same-origin model and runtime URLs are used.
importScripts('/selection-ai/tf.min.js','/selection-ai/tf-tflite.min.js');
let model,height,width;
self.onmessage=async({data})=>{
  try{
    if(!model){await tf.setBackend('cpu');await tf.ready();tflite.setWasmPath('/selection-ai/');
      model=await tflite.loadTFLiteModel('/selection-ai/magic_touch.tflite',{numThreads:1});[,height,width]=model.inputs[0].shape;}
    if(data.init){self.postMessage({width,height});return;}
    const input=data.input;
    const result=tf.tidy(()=>{
      const prediction=model.predict(tf.tensor4d(input,[1,height,width,4]));
      const output=prediction.dataSync?prediction:Object.values(prediction)[0];
      const data=output.dataSync(),[,h,w,channels]=output.shape;
      const probabilities=new Float32Array(h*w);
      for(let i=0;i<probabilities.length;i++){
        const value=data[i*channels+channels-1];
        probabilities[i]=channels===2?1/(1+Math.exp(data[i*2]-value)):1/(1+Math.exp(-value));
      }
      return {probabilities,w,h};
    });
    self.postMessage(result,[result.probabilities.buffer]);
  }catch(error){self.postMessage({error:String(error.message||error)});}
};
