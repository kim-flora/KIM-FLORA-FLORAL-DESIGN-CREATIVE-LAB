import {cpSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const path='public/selection-ai';
mkdirSync(path,{recursive:true});
const pkg='node_modules/@mediapipe/tasks-vision';
cpSync(pkg+'/vision_bundle.mjs',path+'/vision.mjs');
cpSync(pkg+'/wasm',path+'/wasm',{recursive:true});
const file=path+'/magic_touch.tflite';
execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','3','https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite','-o',file]);
if(createHash('sha256').update(readFileSync(file)).digest('hex')!=='e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25')throw Error('Invalid MagicTouch model');
// Single-threaded TFLite interpreter for devices without a WebGL context.
cpSync('node_modules/@tensorflow/tfjs/dist/tf.min.js',path+'/tf.min.js');
cpSync('node_modules/@tensorflow/tfjs-tflite/dist/tf-tflite.min.js',path+'/tf-tflite.min.js');
for(const suffix of ['', '_simd'])for(const ext of ['js','wasm']){
  const name='tflite_web_api_cc'+suffix+'.'+ext;
  cpSync('node_modules/@tensorflow/tfjs-tflite/wasm/'+name,path+'/'+name);
}
cpSync('floral-cpu-worker.js',path+'/floral-cpu-worker.js');
