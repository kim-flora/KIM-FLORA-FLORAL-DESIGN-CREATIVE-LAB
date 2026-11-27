const reviewLabels={form:'Hình dáng',layout:'Bố cục',ratio:'Tỷ lệ',focal:'Trọng tâm',balance:'Cân bằng',rhythm:'Nhịp điệu',flow:'Dòng chảy',space:'Khoảng trống'};
const reviewDrafts=new Map();
const generalNote=document.getElementById('compUserNotes');
let draft=structuredClone(state.compReviewDraft??{notes:{},general:'',id:null}), reviewSource='';
generalNote.value=draft.general;
function rememberReviewDraft(){
  if(reviewSource && (!compBgImg.complete || !compBgImg.naturalWidth))return;
  state.compReviewDraft=structuredClone(draft);
  try{persist();}catch{
    reviewStatus.textContent='Chưa lưu được bản nháp trên trình duyệt. Chị vẫn có thể dùng nút Lưu nhận xét và ảnh.';
  }
}
generalNote.oninput=()=>{
  draft.general=generalNote.value;
  rememberReviewDraft();
};
function changeReviewSource(src,restore){
  if(restore){reviewSource=src;return;}
  if(src===reviewSource)return;
  draft.general=generalNote.value;
  if(reviewSource)reviewDrafts.set(reviewSource,draft);
  reviewSource=src;
  draft=reviewDrafts.get(src)||{notes:{},general:'',id:null};
  generalNote.value=draft.general;
  state.compReviewDraft=structuredClone(draft);
  renderCompDiagnosis();
}
function reviewNode(tag,text,style){
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  if(style)node.className=style;
  return node;
}
const reviewButtonClass='rounded-lg border px-3 py-2 text-xs font-semibold';
const reviewFields=document.getElementById('compDiagnosisCards');
const saveReview=reviewNode('button','Lưu nhận xét và ảnh',reviewButtonClass+' bg-[#1A2621] text-white');
const reviewStatus=reviewNode('p','','text-xs');
reviewStatus.setAttribute('role','status');
const reviewList=document.getElementById('compSavedReviews');
const reviewHeading=reviewNode('h3','Hồ sơ bố cục đã lưu','text-sm font-semibold');
const choices=reviewNode('div','Đang đọc hồ sơ…','flex flex-wrap gap-2 max-h-40 overflow-auto text-xs');
reviewList.append(reviewHeading);
const olderReports=reviewNode('details','','text-xs space-y-2');
olderReports.append(reviewNode('summary','Báo cáo bố cục phiên bản trước'));
const olderReportList=reviewNode('div','','space-y-2');
olderReports.append(olderReportList);
olderReports.ontoggle=()=>{
  if(!olderReports.open)return;
  olderReportList.replaceChildren();
  try{
    const reports=JSON.parse(localStorage.getItem('kim_flora_composition_reports_v1')??'[]');
    for(const report of reports){
      const row=reviewNode('details');
      row.append(reviewNode('summary',report.title),reviewNode('p',report.summary,'whitespace-pre-wrap'));
      olderReportList.append(row);
    }
    if(!reports.length)olderReportList.textContent='Chưa có báo cáo.';
  }catch{olderReportList.textContent='Chưa đọc được báo cáo trên trình duyệt này.';}
};
reviewList.append(choices,olderReports);
reviewFields.after(saveReview,reviewStatus);
function renderCompDiagnosis(){
  const selected=getSelectedCriteria();
  document.getElementById('compFormBadge').textContent=selected.length+'/8 tiêu chí';
  reviewFields.replaceChildren(...selected.map(key=>{
    const label=reviewNode('label',reviewLabels[key],'block text-xs font-semibold');
    const area=reviewNode('textarea','','block w-full mt-1 rounded-lg border p-2 font-normal');
    area.rows=3;area.value=draft.notes[key]||'';
    area.oninput=()=>{draft.notes[key]=area.value;rememberReviewDraft();};
    label.append(area);return label;
  }));
}
async function reviewStore(mode,operation){
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open('kim-flora-composition-notes',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('reviews',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('reviews',mode),request=operation(tx.objectStore('reviews'));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
function reviewCode(id){return 'BC-'+id;}
async function listReviews(){
  try{
    const keys=await reviewStore('readonly',store=>store.getAllKeys());
    choices.replaceChildren(...keys.reverse().map(id=>{
      const button=reviewNode('button',reviewCode(id),reviewButtonClass+' mono-num');
      button.type='button';
      button.title=new Date(id).toLocaleString('vi-VN');
      button.onclick=async()=>{
        try{
          const record=await reviewStore('readonly',store=>store.get(id));
          const dialog=reviewNode('dialog','','rounded-xl border p-4 space-y-2');
          dialog.style.cssText='margin:auto;width:min(38rem,95vw);max-height:85vh;overflow:auto';
          const title=reviewNode('h3',reviewCode(id),'text-sm font-semibold mono-num');
          title.id='compReviewTitle';
          dialog.setAttribute('aria-labelledby',title.id);
          const close=reviewNode('button','Đóng',reviewButtonClass);
          close.onclick=()=>dialog.close();
          const url=URL.createObjectURL(record.image);
          const image=reviewNode('img');image.src=url;image.alt='Ảnh nghiên cứu đã lưu';image.style.maxHeight='46vh';
          const reopen=reviewNode('button','Mở ảnh và nhận xét',reviewButtonClass);
          reopen.onclick=async()=>{
            if(Object.values(draft.notes).some(Boolean)||generalNote.value){
              if(!window.confirm('Mở hồ sơ này và thay nhận xét đang hiển thị?'))return;
            }
            reopen.disabled=true;
            try{
              const source=record.source||await new Promise((resolve,reject)=>{
                const reader=new FileReader();
                reader.onload=()=>resolve(reader.result);
                reader.onerror=()=>reject(reader.error);
                reader.readAsDataURL(record.image);
              });
              const check=new Image();
              check.src=source;
              await check.decode();
              if(!dialog.open)return;
              loadCompImage(source,false,()=>{
                state.compAnnotations=structuredClone(record.annotations??[]);
                draft={notes:{...record.notes},general:record.general??'',id:record.id};
                generalNote.value=draft.general;
                state.compReviewDraft=structuredClone(draft);
                renderCompDiagnosis();
                dialog.close();
                reviewStatus.textContent='Đã mở ảnh và nhận xét từ hồ sơ.';
              });
            }catch{
              const error=reviewNode('p','Chưa tải được ảnh đã lưu. Chị vẫn có thể đọc nhận xét trong hồ sơ này.','text-xs');
              reopen.after(error);
            }finally{reopen.disabled=false;}
          };
          dialog.append(title,close,reopen,image);
          for(const [key,text] of [...Object.entries(record.notes),['general',record.general]]){
            if(!text)continue;
            const p=reviewNode('p',text);p.style.whiteSpace='pre-wrap';
            dialog.append(reviewNode('strong',reviewLabels[key]||'Nhận định nghiên cứu'),p);
          }
          dialog.onclose=()=>{URL.revokeObjectURL(url);dialog.remove();};
          document.body.append(dialog);dialog.showModal();
        }catch{reviewStatus.textContent='Chưa mở được hồ sơ.';}
      };
      return button;
    }));
    if(!keys.length)choices.textContent='Chưa có hồ sơ.';
  }catch{choices.textContent='Chưa đọc được hồ sơ trên thiết bị.';}
}
listReviews();
window.addEventListener('focus',listReviews);
saveReview.onclick=async()=>{
  if(saveReview.disabled)return;
  if(!compBgImg.complete||!compBgImg.naturalWidth){reviewStatus.textContent='Chọn ảnh trước khi lưu.';return;}
  const current=draft;
  current.general=generalNote.value;
  if(![...Object.values(current.notes),current.general].some(v=>v.trim())){reviewStatus.textContent='Nhập nhận xét trước khi lưu.';return;}
  saveReview.disabled=true;
  try{
    renderCompCanvas();
    const record={
      id:current.id||Date.now(),notes:{...current.notes},general:current.general,
      source:state.compSource,annotations:state.compSource?structuredClone(state.compAnnotations):[]
    };
    record.image=await new Promise((resolve,reject)=>compCanvas.toBlob(blob=>blob?resolve(blob):reject(Error()),'image/png'));
    await reviewStore('readwrite',store=>store.put(record));
    window.dispatchEvent(new Event('studio:storage-saved'));
    current.id=record.id;
    if(current===draft)rememberReviewDraft();
    reviewStatus.textContent='Đã lưu hồ sơ '+reviewCode(record.id)+'.';
    await listReviews();
  }catch{reviewStatus.textContent='Chưa lưu được nhận xét và ảnh. Hãy kiểm tra dung lượng trình duyệt và thử lại.';}
  finally{saveReview.disabled=false;}
};
renderCompDiagnosis();