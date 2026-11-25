import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = path => readFileSync(path,'utf8');
const save = (path,data) => writeFileSync('public/'+path,data);
let html = read('index.txt');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!script) throw Error('Missing Studio application');
const briefStart=script[1].indexOf('function generateDmDirectionText()');
const briefEnd=script[1].indexOf('function buildDmThreeOptions()',briefStart);
if(briefStart<0||briefEnd<0)throw Error('Unexpected Moodboard brief layout');
script[1]=script[1].slice(0,briefStart)+read('moodboard-brief.js')+'\n'+script[1].slice(briefEnd);
const focusStart=script[1].indexOf('const pixels = [];',script[1].indexOf('function extractColorsFromCanvas('));
const focusEnd=script[1].indexOf('// Deterministic K-Means++ initialization',focusStart);
if(focusStart<0||focusEnd<0)throw Error('Missing Color Studio extraction');
script[1]=script[1].slice(0,focusStart)+`
      const step=Math.max(1,Math.floor(w*h/6000));
      const pixels=focusMode ? flowerLeafSamples(imgData,w,h,step) : [];
      if(!focusMode)for(let p=0;p<w*h;p+=step){
        const i=p*4;
        if(imgData[i+3]>=128)pixels.push([imgData[i],imgData[i+1],imgData[i+2]]);
      }
      if(!pixels.length || (focusMode && pixels.length<Math.max(2,w*h/step*.002))){
        showToast('Chưa tách được hoa và lá khỏi nền. Bảng màu hiện tại vẫn là kết quả trước đó.', 'info');
        return;
      }
      `+script[1].slice(focusEnd);
script[1]=script[1].replace('function extractColorsFromCanvas(k)',()=>read('flower-leaf-samples.js')+'\\nfunction extractColorsFromCanvas(k)');
const normalization=script[1].indexOf('// Normalize to 100%',focusStart);
if(normalization<0)throw Error('Missing palette normalization');
script[1]=script[1].slice(0,normalization)+`
      if(focusMode){
        for(let j=extracted.length-1;j>=0;j--){
          const swatch=extracted[j];
          const index=Number(swatch.id.split('-').pop());
          if(!counts[index]){extracted.splice(j,1);continue;}
          swatch.ratio=Math.floor(counts[index]*100/total);
        }
        const ranked=[...extracted].sort((a,b)=>{
          const remainder=s=>counts[Number(s.id.split('-').pop())]*100/total-s.ratio;
          return remainder(b)-remainder(a);
        });
        const missing=100-extracted.reduce((sum,s)=>sum+s.ratio,0);
        for(let i=0;i<missing;i++)ranked[i].ratio++;
      }
      `+script[1].slice(normalization);
script[1]=script[1].replace('p.ratio = p.imgArea || 5','p.ratio = p.imgArea ?? 0');
const start=script[1].indexOf('// ==================== AUTH & PASSWORD MANAGEMENT');
const end=script[1].indexOf('// ==================== STORAGE & UTILITIES');
if(start<0||end<start)throw Error('Unexpected Studio authentication layout');
save('studio-main.js',script[1].slice(0,start)+"const gate = document.getElementById('authGateOverlay');\n    const error = document.getElementById('loginErrorMsg');\n    async function session(body) {\n      const response = await fetch('/api/auth', body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {cache:'no-store'});\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.message || 'Chưa kết nối được Creative Lab.');\n      return data;\n    }\n    function unlock() {\n      gate.hidden = true;\n      gate.classList.add('hidden');\n      if (['#projects','#composition','#color-studio'].includes(location.hash)) location.replace('/workspace.html'+location.hash);\n    }\n    session().then(data=>{if(data.signedIn) unlock();}).catch(()=>{});\n    document.getElementById('loginForm').onsubmit=async event=>{\n      event.preventDefault();\n      try {\n        const input=document.getElementById('loginPasswordInput');\n        const data=await session({action:'login',password:input.value});\n        if(data.signedIn){input.value='';unlock();}\n      }catch(e){error.textContent=e.message;error.classList.remove('hidden');}\n    };\n    document.getElementById('btnToggleLoginPw').onclick=()=>{\n      const input=document.getElementById('loginPasswordInput');\n      input.type=input.type==='password'?'text':'password';\n    };\n    for(const id of ['btnHeaderManagePw','btnLoginOpenChangePw']){\n      document.getElementById(id).onclick=()=>location.assign('/workspace.html?settings=1');\n    }\n    document.getElementById('btnLoginResetPw').remove();\n    document.getElementById('btnHeaderLogout').onclick=async ()=>{\n      try {await session({action:'logout'});location.reload();}\n      catch(e){showToast(e.message,'error');}\n    };\n"+script[1].slice(end));
html=html.replace(script[0],'<script src="/studio-main.js"></script>')
  .replace('<script src="https://cdn.tailwindcss.com/3.4.17"></script>','<link rel="stylesheet" href="/studio-layout.css">')
  .replace('https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js','/studio-icons.js')
  .replace('<p class="text-xs text-[#5F6B64]">Tách màu hoa chính xác từ ảnh thật, tùy chỉnh 2–10 màu, chia tỷ lệ 60–30–10 và mô phỏng thực tế trên sản phẩm hoa.</p>', '')
  .replace('</nav>','<a class="whitespace-nowrap px-3 py-2 text-xs font-semibold" href="/workspace.html">Công cụ &amp; hồ sơ đã lưu</a></nav>');
save('index.html',html);
copyFileSync('node_modules/lucide/dist/umd/lucide.min.js','public/studio-icons.js');
writeFileSync('studio-tailwind-input.css','@tailwind base;@tailwind components;@tailwind utilities;');
execFileSync('node_modules/.bin/tailwindcss',['-i','studio-tailwind-input.css','--content','public/index.html,public/studio-main.js','-o','public/studio-layout.css','--minify'],{stdio:'inherit'});
