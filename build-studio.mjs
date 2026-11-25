import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = path => readFileSync(path,'utf8');
const save = (path,data) => writeFileSync('public/'+path,data);
let html = read('index.txt');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!script) throw Error('Missing Studio application');
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
