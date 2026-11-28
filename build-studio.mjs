import './build-smart-selection.mjs';
import { palettePixelLimit } from './public/color-model.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = path => readFileSync(path,'utf8');
const save = (path,data) => writeFileSync('public/'+path,data);
let html = read('index.txt');
html = html.replace(
  /(<div id="inlineSavedColorsGrid"[^>]*><\/div>)/,
  `$1
    <div class="mt-3 space-y-2 text-xs">
      <h3 class="font-semibold">Kho bảng màu phiên bản trước</h3>
      <ul id="legacyPaletteList" class="space-y-2"></ul>
      <p id="legacyPaletteStatus" role="status"></p>
    </div>`
);
html = html.replace('</nav>', `
  <button type="button" id="openContentBackups" class="px-3 py-2 text-xs font-semibold">Kho lưu trực tuyến</button>
  <span id="contentBackupStatus" class="px-2 text-xs" role="status"></span>
</nav>`);
html = html.replace(/<\/body>(?=\s*<\/html>\s*$)/, `
<dialog id="contentBackupDialog" class="m-auto w-11/12 max-w-md rounded-xl bg-white p-5">
  <form method="dialog"><button class="float-right underline">Đóng</button></form>
  <h2 class="mb-3 text-lg font-semibold">Kho lưu trực tuyến</h2>
  <button type="button" id="loadSharedContent" class="mb-3 mr-3 underline">Tải dữ liệu dùng chung</button>
  <button type="button" id="saveContentBackup" class="mb-3 underline">Sao lưu ngay</button>
  <ul id="contentBackupHistory" class="max-h-80 space-y-2 overflow-auto"></ul>
</dialog></body>`);
const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!script) throw Error('Missing Studio application');
const colorAssessmentMarker = '    // Color assessment renderer';
if (!script[1].includes(colorAssessmentMarker)) throw Error('Missing color assessment renderer');
script[1] = script[1].replace(colorAssessmentMarker, () => read('studio-academy-colors.js') + read('studio-color-assessment.js'));
const approvalWorkspaceMarker = '    // Client approval workspace renderer';
if (!script[1].includes(approvalWorkspaceMarker)) throw Error('Missing client approval workspace');
script[1] = script[1].replace(approvalWorkspaceMarker, () => read('studio-client-approval.js'));
const technicalDrawingMarker = '    // Recipe technical drawing renderer';
if (!script[1].includes(technicalDrawingMarker)) throw Error('Missing technical drawing renderer');
script[1] = script[1].replace(technicalDrawingMarker, () => read('studio-technical-drawing.js'));
const floralProofMarker = '    // Floral product proof renderer';
if (!script[1].includes(floralProofMarker)) throw Error('Missing floral proof renderer');
script[1] = script[1].replace(floralProofMarker, () => read('studio-floral-proof.js'));
const archiveStart = script[1].indexOf('// ==================== MODULE 6: PROJECT ARCHIVE');
const archiveEnd = script[1].indexOf('// ==================== MODULE 2B:', archiveStart);
if (archiveStart < 0 || archiveEnd < 0) throw Error('Missing project archive');
script[1] = script[1].slice(0, archiveStart) + read('studio-project-archive.js').trimStart() + '      ' + script[1].slice(archiveEnd);

const from=script[1].indexOf('function extractColorsFromCanvas(k)');
const to=script[1].indexOf('state.palette = extracted;',from);
if(from<0||to<0)throw Error('Missing Color Studio extraction');
script[1]=script[1].slice(0,from)+read('flower-leaf-samples.js')+'\n'+`let paletteImage, paletteRequest;
    async function extractColorsFromCanvas(k) {
      paletteRequest?.abort();
      const img=paletteImage, request=new AbortController();
      paletteRequest=request;
      if(!img)return;
      const focus=document.getElementById('extractFocusMode').value==='focus';
      try {
        const {extractImagePalette}=await import('/image-palette.js');
        if(request.signal.aborted)return;
        const colors=await extractImagePalette(img,k,focus,request.signal);
        if(request.signal.aborted||img!==paletteImage)return;
        if(!colors.length){
          showToast(focus?'Chưa xác định được vùng hoa. Bạn có thể thử chế độ Toàn bộ khung hình.':'Ảnh không có điểm màu đủ rõ để lấy mẫu.', 'info');
          return;
        }
        state.colorMeasurement={scope:focus?'focus':'full',colors:structuredClone(colors)};
        const extracted=colors.map(c=>({id:crypto.randomUUID(),hex:c.hex,ratio:c.percent,imgArea:c.percent,locked:false,name:studioColorName(c.hex)}));
        `+script[1].slice(to);
script[1]=script[1].replace('colorCtx.drawImage(img,','paletteRequest?.abort(); paletteImage=img; colorCtx.drawImage(img,')
  .replace("showToast(`Đã trích xuất ${k} màu chủ đạo từ ảnh!`, 'success');","showToast(`Đã trích xuất ${extracted.length} màu chủ đạo từ ảnh!`, 'success'); } catch {if(!request.signal.aborted)showToast('Chưa đọc được màu ảnh.', 'error');}");
html=html.replace('value="focus" selected','value="focus"').replace('<option value="full">Toàn bộ khung hình','<option value="full" selected>Toàn bộ khung hình')
  .replace('id="extractCountRange" min="2" max="10" value="5"','id="extractCountRange" min="2" max="10" value="7"')
  .replace(/(id="extractCountVal"[^>]*>)5</,(_,prefix)=>prefix+'7<');
const analysisStart=script[1].indexOf('function analyzeFloralComposition()');
const cardsEnd=script[1].indexOf("const container = document.getElementById('compDiagnosisCards')",analysisStart);
if(analysisStart<0||cardsEnd<0)throw Error('Missing Composition Analyzer');
script[1]=script[1].slice(0,analysisStart)+read('studio-composition-measure.js')+`
    const useGuides=document.createElement('input');
    useGuides.type='checkbox';
    const guideLabel=document.createElement('label');
    guideLabel.className='flex items-center gap-2 mt-2 text-xs';
    guideLabel.append(useGuides,'Dùng vùng khoanh, trọng tâm và dòng chảy đã vẽ để phân tích');
    document.getElementById('btnCompAutoAnalyze').after(guideLabel);
    const activeGuides=new WeakSet();
    function selectedFlowerGuides(){
      const out={};
      if(useGuides.checked)for(const mark of state.compAnnotations){
        if(activeGuides.has(mark) && ['box','flow','focal'].includes(mark.tool)){
          if(mark.tool==='box' && Math.abs(mark.x2-mark.x1)*Math.abs(mark.y2-mark.y1)<.001)continue;
          out[mark.tool]=mark;
        }
      }
      return out;
    }
    useGuides.onchange=()=>{analyzeFloralComposition();renderCompCanvas();};
    function analyzeFloralComposition(){
      if(!compBgImg.complete||!compBgImg.naturalWidth)return;
      const scale=Math.min(1,180/Math.max(compCanvas.width,compCanvas.height));
      const off=document.createElement('canvas');
      off.width=Math.max(1,Math.round(compCanvas.width*scale));
      off.height=Math.max(1,Math.round(compCanvas.height*scale));
      const ctx=off.getContext('2d');
      ctx.drawImage(compBgImg,0,0,off.width,off.height);
      compAutoResult=measureStudioComposition(ctx.getImageData(0,0,off.width,off.height).data,off.width,off.height,selectedFlowerGuides());
      renderCompDiagnosis();
    }
    `+read('studio-review.js')+'\n'+script[1].slice(script[1].indexOf('function renderCompCanvas()',cardsEnd));
script[1]=script[1].replace("if (selected.includes('flow')) {","if (selected.includes('flow') && r.flow) {");
const arrow=script[1].indexOf('const ang = Math.atan2(ey - my, ex - mx);');
if(arrow>=0)script[1]=script[1].slice(0,arrow)+script[1].slice(script[1].indexOf('compCtx.restore();',arrow));
script[1]=script[1].replace('function loadCompImage(src) {','function loadCompImage(src) { activeGuideReset(); changeReviewSource(src);')
  .replace('const activeGuides=new WeakSet();','let activeGuides=new WeakSet(); function activeGuideReset(){activeGuides=new WeakSet();useGuides.checked=false;}')
  .replace(/(state\.compAnnotations\.push\(\{ tool: activeCompTool[^\n]+?\}\);)/,'$1 activeGuides.add(state.compAnnotations.at(-1)); if(useGuides.checked)analyzeFloralComposition();')
  .replace('state.compAnnotations.pop(); renderCompCanvas();','state.compAnnotations.pop(); if(useGuides.checked)analyzeFloralComposition(); renderCompCanvas();')
  .replace('state.compAnnotations = []; renderCompCanvas();','state.compAnnotations = []; if(useGuides.checked)analyzeFloralComposition(); renderCompCanvas();');
const contourStart=script[1].indexOf("if (selected.includes('form') && r.silhouettePoly");
const contourEnd=script[1].indexOf('// Focal Zones',contourStart);
if(contourStart<0||contourEnd<0)throw Error('Missing composition outline');
script[1]=script[1].slice(0,contourStart)+`if(selected.includes('form') && r.boundary){
  compCtx.save();compCtx.fillStyle='rgba(245,158,11,.78)';
  for(const [x,y] of r.boundary)compCtx.fillRect(x*w,y*h,1.6,1.6);
  compCtx.restore();
}
`+script[1].slice(contourEnd);
const penPage=freehandStudio(script[1],html);
script[1]=penPage.script;
html=penPage.html;
script[1]=preserveStudioState(script[1].replace(/\r\n/g,'\n'));
script[1]=script[1].replace('function renderInlineSavedColors() {', () => `
    window.addEventListener('studio:load-saved-palette', event => {
      const {palette,image}=event.detail;
      state.palette=palette.map(color=>({
        id:crypto.randomUUID(),hex:color.hex,ratio:color.weight,locked:!!color.locked,name:color.name||color.hex
      }));
      normalizeRatios();
      loadColorRecipeSource({image});
      renderColorStudio();
      try{persist();}catch{}
    });
    function renderInlineSavedColors() {
`);
const start=script[1].indexOf('// ==================== AUTH & PASSWORD MANAGEMENT');
const end=script[1].indexOf('// ==================== STORAGE & UTILITIES');
if(start<0||end<start)throw Error('Unexpected Studio authentication layout');
save('studio-main.js',script[1].slice(0,start)+"const gate = document.getElementById('authGateOverlay');\n    const error = document.getElementById('loginErrorMsg');\n    async function session(body) {\n      const response = await fetch('/api/auth', body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {cache:'no-store'});\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.message || 'Chưa kết nối được Creative Lab.');\n      return data;\n    }\n    let unlocking;\n    function unlock() {\n      unlocking??=openStudio().finally(()=>{unlocking=null;});\n      return unlocking;\n    }\n    async function openStudio() {\n      if(gate.hidden)return;\n      const pending=[];\n      window.dispatchEvent(new CustomEvent('studio:before-ready',{detail:pending}));\n      if((await Promise.all(pending)).some(Boolean))return;\n      error.classList.add('hidden');\n      gate.hidden = true;\n      gate.classList.add('hidden');\n      window.dispatchEvent(new Event('studio:ready'));\n      const tab = new Map([['#projects','projects'],['#du-an-luu-tru','projects'],['#composition','composition'],['#color-studio','color'],['#recipe','recipe'],['#inventory','inventory'],['#moodboard','moodboard']]).get(location.hash);\n      let currentTab;\n      try{currentTab=sessionStorage.getItem('kim-flora-sync-tab');sessionStorage.removeItem('kim-flora-sync-tab');}catch{}\n      const active=[...document.querySelectorAll('#mainNav [data-tab]')].find(button=>button.dataset.tab===(currentTab||tab));\n      active?.click();\n    }\n    window.addEventListener('load',()=>session().then(data=>{if(data.signedIn)return unlock();}).catch(e=>{error.textContent=e.message;error.classList.remove('hidden');}));\n    document.getElementById('loginForm').onsubmit=async event=>{\n      event.preventDefault();\n      const submit=event.currentTarget.querySelector('button[type=submit]');\n      if(submit.disabled || unlocking)return;\n      submit.disabled=true;\n      error.classList.add('hidden');\n      try {\n        const input=document.getElementById('loginPasswordInput');\n        const data=await session({action:'login',password:input.value});\n        if(data.signedIn){input.value='';await unlock();}\n      }catch(e){error.textContent=e.message;error.classList.remove('hidden');}\n      finally{submit.disabled=false;}\n    };\n    document.getElementById('btnToggleLoginPw').onclick=()=>{\n      const input=document.getElementById('loginPasswordInput');\n      input.type=input.type==='password'?'text':'password';\n    };\n    (function setupStudioPasswordDialog(){\n  const dialog=document.createElement('dialog');\n  dialog.setAttribute('aria-labelledby','studio-password-heading');\n  dialog.className='rounded-xl border border-[#E4DFD5] bg-[#F7F4EF] p-5 text-[#1A2621] shadow-xl';\n  dialog.style.cssText='margin:auto;width:min(26rem,calc(100% - 2rem))';\n  dialog.innerHTML=`<form class=\"space-y-3\"><h2 id=\"studio-password-heading\" class=\"text-xl font-semibold\">Đổi mật khẩu</h2>\n    <label class=\"block text-sm\">Mật khẩu hiện tại<input class=\"block w-full rounded border p-2\" name=\"password\" type=\"password\" autocomplete=\"current-password\" required maxlength=\"128\"></label>\n    <label class=\"block text-sm\">Mật khẩu mới (tối thiểu 12 ký tự)<input class=\"block w-full rounded border p-2\" name=\"nextPassword\" type=\"password\" autocomplete=\"new-password\" required minlength=\"12\" maxlength=\"128\"></label>\n    <label class=\"block text-sm\">Nhập lại mật khẩu mới<input class=\"block w-full rounded border p-2\" name=\"confirmation\" type=\"password\" autocomplete=\"new-password\" required minlength=\"12\" maxlength=\"128\"></label>\n    <label class=\"flex gap-2 text-sm\"><input type=\"checkbox\">Hiện mật khẩu</label>\n    <p role=\"status\" aria-live=\"polite\"></p><div class=\"flex justify-end gap-2\">\n    <button type=\"button\" class=\"rounded border px-3 py-2\">Hủy</button><button type=\"submit\" class=\"rounded bg-[#1A2621] px-3 py-2 text-white\">Lưu mật khẩu</button></div></form>`;\n  document.body.append(dialog);\n  const form=dialog.querySelector('form'), message=form.querySelector('[role=status]');\n  const fields=[...form.querySelectorAll('input[name]')], toggle=form.querySelector('[type=checkbox]');\n  const submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[type=button]');\n  toggle.onchange=()=>fields.forEach(input=>input.type=toggle.checked?'text':'password');\n  cancel.onclick=()=>dialog.close();\n  dialog.oncancel=event=>{if(submit.disabled)event.preventDefault();};\n  dialog.onclose=()=>{form.reset();toggle.onchange();message.textContent='';};\n  for(const id of ['btnHeaderManagePw','btnLoginOpenChangePw']){\n    document.getElementById(id).onclick=()=>{dialog.showModal();fields[0].focus();};\n  }\n  form.onsubmit=async event=>{\n    event.preventDefault();\n    if(submit.disabled)return;\n    const [password,nextPassword,confirmation]=fields.map(f=>f.value);\n    if(nextPassword!==confirmation){message.textContent='Hai lần nhập mật khẩu mới chưa khớp.';fields[2].focus();return;}\n    submit.disabled=cancel.disabled=true;\n    try{\n      if(!(await session()).signedIn)await session({action:'login',password});\n      const data=await session({action:'change',password,nextPassword,confirmation});\n      dialog.close();\n      gate.hidden=false;gate.classList.remove('hidden');\n      error.textContent=data.message;error.classList.remove('hidden');\n      const input=document.getElementById('loginPasswordInput');input.value='';input.focus();\n    }catch(e){message.textContent=e.message;}\n    finally{submit.disabled=cancel.disabled=false;}\n  };\n})();\n    document.getElementById('btnLoginResetPw').remove();\n    document.getElementById('btnHeaderLogout').onclick=async ()=>{\n      try {const pending=[];window.dispatchEvent(new CustomEvent('studio:before-logout',{detail:pending}));await Promise.allSettled(pending);await session({action:'logout'});location.reload();}\n      catch(e){showToast(e.message,'error');}\n    };\n"+script[1].slice(end));
html=html.replace(script[0],'<script src="/studio-main.js"></script><script type="module" src="/legacy-palette-archive.js"></script><script type="module" src="/content-backups.js"></script>')
  .replace('<script src="https://cdn.tailwindcss.com/3.4.17"></script>','<link rel="stylesheet" href="/studio-layout.css">')
  .replace('https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js','/studio-icons.js')
  .replace('<p class="text-xs text-[#5F6B64]">Tách màu hoa chính xác từ ảnh thật, tùy chỉnh 2–10 màu, chia tỷ lệ 60–30–10 và mô phỏng thực tế trên sản phẩm hoa.</p>', '');
html=html.replace('Bước 4 – Kết quả Phân tích','Bước 4 – Nhận xét của bạn').replace('Bước 4: Đọc kết quả','Bước 4: Ghi nhận xét').replace('Ẩn/Hiện Nhận xét Tự động','Ẩn/Hiện nhận xét').replace('Nhận định nghiên cứu của bạn (So sánh với máy):','Nhận định nghiên cứu của bạn:');
html=html.replace('</head>','<link rel="stylesheet" href="/moodboard-research.css"></head>');
save('moodboard-mask.js','export '+read('flower-leaf-samples.js'));
save('index.html',html);
copyFileSync('node_modules/lucide/dist/umd/lucide.min.js','public/studio-icons.js');
writeFileSync('studio-tailwind-input.css','@tailwind base;@tailwind components;@tailwind utilities;');
execFileSync('node_modules/.bin/tailwindcss',['-i','studio-tailwind-input.css','--content','public/index.html,public/studio-main.js','-o','public/studio-layout.css','--minify'],{stdio:'inherit'});

function freehandStudio(script,html){
  function splice(source,start,end,replacement){
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    if(a<0||b<0)throw Error('Studio layout changed: '+start);
    return source.slice(0,a)+replacement+source.slice(b);
  }
  html=splice(html,'<!-- Step 2: Select Analysis Criteria','<!-- Step 5:', '');
  html=html.replace(/<button data-cstep="2"[^>]*>[^<]*<\/button>\s*<span[^>]*>[^<]*<\/span>/,'')
    .replace(/<label[^>]*>\s*<input[^>]*id="toggleAutoOverlay"[^>]*>[^<]*<\/label>/,'')
    .replace(/<div[^>]*id="compToolButtons">[\s\S]*?<\/div>/,'')
    .replace(/<p[^>]*>Thực hành theo 5 bước:[^<]*<\/p>/,'')
    .replaceAll('Bước 5 – Tự đánh dấu &amp; So sánh','Bước 4 – Bút vẽ tự do')
    .replaceAll('Bước 5: Tự đánh dấu &amp; So sánh','Bước 4: Vẽ tự do')
    .replaceAll('Bước 4: Đọc kết quả','Bước 3: Ghi nhận xét').replaceAll('Bước 4: Ghi nhận xét','Bước 3: Ghi nhận xét')
    .replaceAll('Bước 4 – Kết quả Phân tích','Bước 3 – Nhận xét của bạn').replaceAll('Bước 4 – Nhận xét của bạn','Bước 3 – Nhận xét của bạn')
    .replaceAll('Bước 3: Xem trực quan','Bước 2: Xem ảnh').replaceAll('(Bước 5)','(Bước 4)')
    .replace(/data-cstep="([345])"/g,(_,n)=>`data-cstep="${n-1}"`);
  script=splice(script,'function getSelectedCriteria()', 'const reviewLabels=',`function getSelectedCriteria(){return Object.keys(reviewLabels);}
    function analyzeFloralComposition(){renderCompDiagnosis();}
    `).replace('activeGuideReset(); changeReviewSource(src);','changeReviewSource(src);')
    .replaceAll('if(useGuides.checked)analyzeFloralComposition();','')
    .replace("const desc = a.tool === 'focal'", "const desc = a.tool === 'pen' ? 'Nét bút tự do' : a.tool === 'focal'");
  script=splice(script,"document.querySelectorAll('.comp-crit').forEach", "['guideThirds'",'');
  script=splice(script,"document.getElementById('btnCompAutoAnalyze').onclick", "document.getElementById('btnCompUndo').onclick",'');
  script=script.replace("if (ann.tool === 'focal') {",`if(ann.tool==='pen'){
      const points=ann.points||[];
      compCtx.lineCap='round';compCtx.lineJoin='round';
      if(points.length===1){compCtx.beginPath();compCtx.arc(points[0].x*w,points[0].y*h,1.5,0,2*Math.PI);compCtx.fill();}
      if(points.length>1){compCtx.beginPath();points.forEach((p,i)=>i?compCtx.lineTo(p.x*w,p.y*h):compCtx.moveTo(p.x*w,p.y*h));compCtx.stroke();}
    }else if (ann.tool === 'focal') {`);
  script=splice(script,'if (isDrawingComp && compStart','renderCompMetrics();','if(penStroke)drawShape(penStroke);\n      ');
  script=splice(script,'let isPanningComp = false', "document.querySelectorAll('.comp-color-btn')",`
    let penStroke=null,penPointer=null;
    compCanvas.style.touchAction='none';
    compCanvas.style.cursor='crosshair';
    function penPoint(e){
      const rect=compCanvas.getBoundingClientRect();
      return {x:clamp((e.clientX-rect.left)/rect.width,0,1),y:clamp((e.clientY-rect.top)/rect.height,0,1)};
    }
    compCanvas.onpointerdown=e=>{
      if(penPointer!==null||e.button!==0||!compBgImg.naturalWidth)return;
      penPointer=e.pointerId;compCanvas.setPointerCapture(penPointer);
      penStroke={tool:'pen',color:activeCompColor,points:[penPoint(e)]};
      renderCompCanvas();
    };
    compCanvas.onpointermove=e=>{
      if(e.pointerId!==penPointer)return;
      const samples=e.getCoalescedEvents?.()||[];
      for(const sample of samples.length?samples:[e])penStroke.points.push(penPoint(sample));
      renderCompCanvas();
    };
    compCanvas.onpointerup=e=>{
      if(e.pointerId!==penPointer)return;
      const p=penPoint(e),last=penStroke.points.at(-1);
      if(last.x!==p.x||last.y!==p.y)penStroke.points.push(p);
      state.compAnnotations.push(penStroke);penStroke=null;penPointer=null;
      renderCompCanvas();persist();
    };
    compCanvas.onlostpointercapture=compCanvas.onpointercancel=e=>{
      if(e.pointerId===penPointer){penStroke=null;penPointer=null;renderCompCanvas();}
    };
    document.querySelectorAll('[data-cstep]').forEach(button=>button.onclick=()=>{
      const ids=['btnCompUpload','compCanvas','compDiagnosisCards','btnCompUndo'];
      const target=button.dataset.cstep==='2'?compCanvas:document.getElementById(ids[Number(button.dataset.cstep)-1]);
      if(button.dataset.cstep==='3')document.getElementById('compAutoReportPanel').classList.remove('hidden');
      target?.scrollIntoView({block:'center',behavior:'smooth'});
    });
    `);
  return {script,html};
}

function preserveStudioState(source){
  function section(start,end,body){
    const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
    if(first<0||last<0)throw Error('Saved-data compatibility check failed: '+start);
    source=source.slice(0,first)+body+'\n'+source.slice(last);
  }
  section('function safeLoad()', 'function showToast(',`let savedRaw=null,readFailed=false;
    function safeLoad(){
      try{
        savedRaw=localStorage.getItem(STORAGE_KEY);
        if(savedRaw===null)return null;
        const value=JSON.parse(savedRaw);
        if(!value||Array.isArray(value)||typeof value!=='object')throw Error();
        return value;
      }catch{
        readFailed=true;
        showToast('Chưa đọc được dữ liệu đã lưu. Bản hiện có được giữ lại.', 'error');
        return null;
      }
    }
    function safeSave(value){
      try{
        if(readFailed || localStorage.getItem(STORAGE_KEY)!==savedRaw){
          throw Error('Dữ liệu đã thay đổi hoặc chưa đọc được. Hãy mở lại Studio trước khi lưu tiếp.');
        }
        const next=JSON.stringify(value);
        localStorage.setItem(STORAGE_KEY,next);
        savedRaw=next;
        window.dispatchEvent(new Event('studio:storage-saved'));
      }catch(error){
        showToast(error.name==='Error'?error.message:'Chưa lưu được thay đổi. Bộ nhớ trình duyệt có thể đã đầy.', 'error');
        throw error;
      }
    }
    function applyDefaults(defaults,saved){
      const result={...saved};
      for(const [key,value] of Object.entries(defaults)){
        if(!Object.hasOwn(result,key))result[key]=structuredClone(value);
        else if(value && typeof value==='object' && !Array.isArray(value) && result[key] && typeof result[key]==='object' && !Array.isArray(result[key])){
          result[key]=applyDefaults(value,result[key]);
        }
      }
      return result;
    }
    `);
  section('let state = Object.assign({}, DEFAULT_STATE', '// ==================== TAB NAVIGATION',`const previouslySaved=safeLoad();
    let state=applyDefaults(DEFAULT_STATE,previouslySaved||{});
    function persist(){safeSave(state);}
    `);
  source=source.replace('function loadImageToColorStudio(src)', 'let colorRequest=0;\n    function loadImageToColorStudio(src,restore=false)')
    .replace("function loadImageToColorStudio(src,restore=false) {","function loadImageToColorStudio(src,restore=false) {\n      const request=++colorRequest;")
    .replace('const maxW = 540, maxH = 340;','if(request!==colorRequest)return;\n        const maxW = 540, maxH = 340;')
    .replace("state.currentImageDataUrl = colorCanvas.toDataURL('image/jpeg', 0.85);",`if(restore){
          const scope=state.colorMeasurement?.scope;
          if(scope==='focus'||scope==='full')document.getElementById('extractFocusMode').value=scope;
          return;
        }
        state.colorMeasurement=null;
        renderColorAnalysisAndMockup();
        const pixelCanvas=document.createElement('canvas');
        const sampleScale=Math.min(1,${palettePixelLimit}/Math.max(img.naturalWidth,img.naturalHeight));
        pixelCanvas.width=Math.max(1,Math.round(img.naturalWidth*sampleScale));
        pixelCanvas.height=Math.max(1,Math.round(img.naturalHeight*sampleScale));
        const pixelCtx=pixelCanvas.getContext('2d');
        pixelCtx.imageSmoothingEnabled=false;
        pixelCtx.drawImage(img,0,0,pixelCanvas.width,pixelCanvas.height);
        state.currentImageDataUrl=pixelCanvas.toDataURL('image/png');`);
  source=source.replace('function loadCompImage(src) {','function loadCompImage(src,restore=false) {')
    .replace('function loadCompImage(src,restore=false) { changeReviewSource(src);','function loadCompImage(src,restore=false,onReady) {')
    .replace('compBgImg.onload = () => {','const requestedImage=compBgImg;\n      compBgImg.onload = () => {\n        if(requestedImage!==compBgImg)return;')
    .replace('compCanvas.height = Math.round(compBgImg.height * scale);',`compCanvas.height = Math.round(compBgImg.height * scale);
        if(!restore){
          const imageCopy=document.createElement('canvas');
          imageCopy.width=compCanvas.width;imageCopy.height=compCanvas.height;
          imageCopy.getContext('2d').drawImage(compBgImg,0,0,imageCopy.width,imageCopy.height);
          state.compSource=imageCopy.toDataURL('image/png');
        }
        changeReviewSource(src,restore);
        onReady?.();`)
    .replace("      compBgImg.src = src;", "      compBgImg.src = src;")
    .replace('        analyzeFloralComposition();\n        renderCompCanvas();','        analyzeFloralComposition();\n        renderCompCanvas();\n        if(!restore)persist();');
  section('// Load default sample image into Color Studio', 'if (window.lucide)',`const sample=document.getElementById('sampleImgBouquet');
      if(!colorRequest){
        if(state.currentImageDataUrl)loadImageToColorStudio(state.currentImageDataUrl,true);
        else if(!previouslySaved && !readFailed && sample?.src)loadImageToColorStudio(sample.src,true);
      }
      if(!compBgImg.src){
        const src=state.compSource || state.currentImageDataUrl || (!previouslySaved && !readFailed && sample?.src);
        if(src)loadCompImage(src,true);
      }
      `);
  return source;
}
