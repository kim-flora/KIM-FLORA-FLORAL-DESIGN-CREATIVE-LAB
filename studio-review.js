const reviewLabels={form:'Hình dáng',layout:'Bố cục',ratio:'Tỷ lệ',focal:'Trọng tâm',balance:'Cân bằng',rhythm:'Nhịp điệu',flow:'Dòng chảy',space:'Khoảng trống'};
const reviewDrafts=new Map();
const generalNote=document.getElementById('compUserNotes');
let draft={notes:{},general:'',id:null}, reviewSource='';
function changeReviewSource(src){
  if(src===reviewSource)return;
  draft.general=generalNote.value;
  if(reviewSource)reviewDrafts.set(reviewSource,draft);
  reviewSource=src;
  draft=reviewDrafts.get(src)||{notes:{},general:'',id:null};
  generalNote.value=draft.general;
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
const reviewList=reviewNode('details');
reviewList.append(reviewNode('summary','Hồ sơ đã lưu trên thiết bị'));
const choices=reviewNode('div','','space-y-2');
reviewList.append(choices);
reviewFields.after(saveReview,reviewStatus,reviewList);
function renderCompDiagnosis(){
  const selected=getSelectedCriteria();
  document.getElementById('compFormBadge').textContent=selected.length+'/8 tiêu chí';
  reviewFields.replaceChildren(...selected.map(key=>{
    const label=reviewNode('label',reviewLabels[key],'block text-xs font-semibold');
    const area=reviewNode('textarea','','block w-full mt-1 rounded-lg border p-2 font-normal');
    area.rows=3;area.value=draft.notes[key]||'';
    area.oninput=()=>{draft.notes[key]=area.value;};
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
async function listReviews(){
  try{
    const keys=await reviewStore('readonly',store=>store.getAllKeys());
    choices.replaceChildren(...keys.reverse().map(id=>{
      const button=reviewNode('button',new Date(id).toLocaleString('vi-VN'),reviewButtonClass);
      button.onclick=async()=>{
        try{
          const record=await reviewStore('readonly',store=>store.get(id));
          const dialog=reviewNode('dialog','','rounded-xl border p-4 space-y-2');
          dialog.style.cssText='margin:auto;width:min(38rem,95vw);max-height:85vh;overflow:auto';
          const close=reviewNode('button','Đóng',reviewButtonClass);
          close.onclick=()=>dialog.close();
          const url=URL.createObjectURL(record.image);
          const image=reviewNode('img');image.src=url;image.alt='Ảnh nghiên cứu đã lưu';image.style.maxHeight='46vh';
          dialog.append(close,image);
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
  }catch{reviewStatus.textContent='Chưa đọc được hồ sơ trên thiết bị.';}
}
reviewList.ontoggle=()=>{if(reviewList.open)listReviews();};
saveReview.onclick=async()=>{
  if(saveReview.disabled)return;
  if(!compBgImg.complete||!compBgImg.naturalWidth){reviewStatus.textContent='Chọn ảnh trước khi lưu.';return;}
  const current=draft;
  current.general=generalNote.value;
  if(![...Object.values(current.notes),current.general].some(v=>v.trim())){reviewStatus.textContent='Nhập nhận xét trước khi lưu.';return;}
  saveReview.disabled=true;
  try{
    renderCompCanvas();
    const record={id:current.id||Date.now(),notes:{...current.notes},general:current.general};
    record.image=await new Promise((resolve,reject)=>compCanvas.toBlob(blob=>blob?resolve(blob):reject(Error()),'image/png'));
    await reviewStore('readwrite',store=>store.put(record));
    current.id=record.id;reviewStatus.textContent='Đã lưu nhận xét và ảnh trên thiết bị này.';
    if(reviewList.open)await listReviews();
  }catch{reviewStatus.textContent='Chưa lưu được nhận xét và ảnh. Hãy kiểm tra dung lượng trình duyệt và thử lại.';}
  finally{saveReview.disabled=false;}
};
renderCompDiagnosis();