    const approvalNode = id => document.getElementById(id);
    const approvalRows = () => Array.isArray(state.approvalDossiers) ? state.approvalDossiers : [];
    const approvalDate = date => new Date(date).toLocaleString('vi-VN');
    const validApprovalImage = value => typeof value==='string' &&
      /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
    let approvalPreviewId;
    let creatingApproval=false;

    function saveApprovalDossiers(rows){
      const previous=state.approvalDossiers;
      state.approvalDossiers=rows;
      try{persist();}catch{
        if(previous===undefined)delete state.approvalDossiers;
        else state.approvalDossiers=previous;
        return false;
      }
      return true;
    }

    function renderApprovalLibrary(){
      const list=approvalNode('approvalList'),rows=approvalRows();
      list.replaceChildren();
      approvalNode('approvalEmpty').hidden=rows.length>0;
      for(const dossier of rows){
        const row=document.createElement('li'),label=document.createElement('div');
        const name=document.createElement('strong'),meta=document.createElement('small');
        name.textContent=dossier.title;
        meta.textContent=[dossier.client,dossier.approvedAt?'Đã duyệt':'Chờ duyệt',approvalDate(dossier.createdAt)].filter(Boolean).join(' · ');
        label.append(name,meta);
        const open=document.createElement('button');
        open.type='button';open.className='project-secondary';open.textContent='Xem hồ sơ';
        open.setAttribute('aria-label','Xem hồ sơ '+dossier.title);
        open.onclick=()=>{approvalPreviewId=dossier.id;renderApprovalPreview();approvalNode('approvalPreview').showModal();};
        row.append(label,open);list.append(row);
      }
    }

    function approvalDimensions(){
      const drawing=state.recipe.technicalDrawing;
      return [['Chính diện',drawing?.front,'rộng × cao'],['Mặt bằng',drawing?.plan,'rộng × sâu']]
        .filter(([,view])=>Number.isFinite(view?.width)&&Number.isFinite(view?.height))
        .map(([label,view,axes])=>label+' '+view.width+' × '+view.height+' cm ('+axes+')').join(' · ');
    }

    approvalNode('approvalNew').onclick=()=>{
      const form=approvalNode('approvalForm');
      form.reset();
      approvalNode('approvalTitle').value=state.projectName||state.recipe.name||'';
      approvalNode('approvalClient').value=state.projectClient||'';
      approvalNode('approvalDimensions').value=approvalDimensions();
      approvalNode('approvalQuote').value=approvalNode('costTotalOrderRevenue').dataset.quote??'';
      approvalNode('approvalNotes').value=state.projectBrief||'';
      approvalNode('approvalImage').querySelector('option[value="recipe"]').disabled=!validApprovalImage(state.recipe.photo);
      approvalNode('approvalFormStatus').textContent='';
      approvalNode('approvalFormDialog').showModal();
    };
    approvalNode('approvalCancel').onclick=()=>approvalNode('approvalFormDialog').close();
    approvalNode('approvalFormDialog').oncancel=event=>{if(creatingApproval)event.preventDefault();};

    async function captureApprovalImage(source,photo,type,colors){
      if(source==='none')return null;
      const canvas=document.createElement('canvas');
      if(source==='recipe'){
        if(!validApprovalImage(photo))throw Error('Missing recipe photo');
        const image=new Image();image.src=photo;await image.decode();
        const scale=Math.min(1,768/Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      }else{
        drawFloralProof(await loadFloralPhoto(type),colors,false,canvas);
      }
      return canvas.toDataURL('image/jpeg',.83);
    }

    approvalNode('approvalForm').onsubmit=async event=>{
      event.preventDefault();
      if(creatingApproval)return;
      const form=event.currentTarget,submit=form.querySelector('[type="submit"]');
      const status=approvalNode('approvalFormStatus'),dialog=approvalNode('approvalFormDialog');
      const read=key=>approvalNode('approval'+key).value.trim();
      const title=read('Title'),quote=approvalNode('approvalQuote').valueAsNumber;
      if(!title||!Number.isSafeInteger(quote)||quote<0){
        status.textContent='Điền tên phương án và báo giá hợp lệ trước khi lưu.';return;
      }
      const {palette,colors}=floralProofColors();
      const type=Object.hasOwn(floralProof.types,state.mockupType)?state.mockupType:'bouquet';
      const dossier={
        id:crypto.randomUUID(),createdAt:new Date().toISOString(),title,client:read('Client'),
        dimensions:read('Dimensions'),quote,notes:read('Notes'),quantity:plannedBatch(),palette:palette.map(swatch=>swatch.hex)
      };
      const source=read('Image'),photo=state.recipe.photo;
      creatingApproval=submit.disabled=approvalNode('approvalCancel').disabled=true;
      status.textContent='Đang lưu hồ sơ…';
      try{
        dossier.image=await captureApprovalImage(source,photo,type,colors);
        if(!saveApprovalDossiers([dossier,...approvalRows()])){
          status.textContent='Chưa lưu được. Kiểm tra trạng thái đồng bộ và thử lại.';return;
        }
        dialog.close();
        renderApprovalLibrary();
        approvalPreviewId=dossier.id;
        renderApprovalPreview();
        approvalNode('approvalPreview').showModal();
      }catch{
        status.textContent='Chưa đọc được ảnh đã chọn. Thử đổi ảnh hoặc lưu hồ sơ không kèm ảnh.';
      }finally{creatingApproval=submit.disabled=approvalNode('approvalCancel').disabled=false;}
    };

    function renderApprovalPreview(){
      const dossier=approvalRows().find(row=>row.id===approvalPreviewId);
      if(!dossier)return;
      const panel=approvalNode('approvalPreviewContent');
      approvalNode('approvalPreviewTitle').textContent=dossier.title;
      panel.replaceChildren();
      for(const text of approvalMetadata(dossier)){
        const line=document.createElement('p');line.textContent=text;panel.append(line);
      }
      if(validApprovalImage(dossier.image)){
        const image=document.createElement('img');image.src=dossier.image;image.alt='Ảnh phương án hoa';panel.append(image);
      }
      const palette=document.createElement('div');palette.className='approval-palette';
      for(const color of dossier.palette.filter(proofHex)){
        const item=document.createElement('span'),chip=document.createElement('i');
        chip.style.backgroundColor=color;
        item.append(chip,color);palette.append(item);
      }
      panel.append(palette);
      if(dossier.notes){
        const notes=document.createElement('p');notes.className='approval-notes';notes.textContent=dossier.notes;panel.append(notes);
      }
      const mark=approvalNode('approvalMark');
      mark.disabled=!!dossier.approvedAt;
      mark.textContent=dossier.approvedAt?'Đã duyệt':'Đánh dấu đã duyệt';
    }

    function approvalMetadata(dossier){
      return [
        dossier.client&&'Khách hàng / sự kiện: '+dossier.client,
        dossier.dimensions&&'Kích thước: '+dossier.dimensions,
        'Báo giá cả lô: '+formatVND(dossier.quote)+' · '+dossier.quantity+' sản phẩm',
        'Lưu ngày '+approvalDate(dossier.createdAt),
        dossier.approvedAt&&'Đã duyệt '+approvalDate(dossier.approvedAt)
      ].filter(Boolean);
    }

    approvalNode('approvalMark').onclick=()=>{
      const dossier=approvalRows().find(row=>row.id===approvalPreviewId);
      if(!dossier||dossier.approvedAt)return;
      const approved={...dossier,approvedAt:new Date().toISOString()};
      if(!saveApprovalDossiers(approvalRows().map(row=>row.id===dossier.id?approved:row)))return;
      renderApprovalLibrary();
      renderApprovalPreview();
    };

    approvalNode('approvalDownload').onclick=()=>{
      const dossier=approvalRows().find(row=>row.id===approvalPreviewId);
      if(!dossier)return;
      const escape=escapeColorReportText;
      const image=validApprovalImage(dossier.image)?'<img src="'+dossier.image+'" alt="Ảnh phương án hoa">':'';
      const swatches=dossier.palette.filter(proofHex).map(color=>'<span><i style="background:'+color+'"></i>'+color+'</span>').join('');
      const documentHtml='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'+
        '<title>'+escape(dossier.title)+'</title><style>body{max-width:850px;margin:1rem auto;padding:1.25rem;color:#253a2e;font:16px/1.5 system-ui}'+
        'h1{font:700 36px Georgia,serif}img{max-width:100%;max-height:65vh;border-radius:8px}section{margin:.9rem 0}span{display:inline-block;margin:0 .4rem .35rem 0;padding:.2rem;border:1px solid #ddd;border-radius:4px}'+
        'i{display:inline-block;width:.85rem;height:.85rem;margin-right:.3rem;border:1px solid #777;vertical-align:middle}.notes{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{padding:0}img{max-height:120mm}}'+
        '</style><main><p>Kim Flora · Hồ sơ duyệt mẫu</p><h1>'+escape(dossier.title)+'</h1>'+
        approvalMetadata(dossier).map(text=>'<p>'+escape(text)+'</p>').join('')+image+
        (swatches?'<section><h2>Bảng màu</h2>'+swatches+'</section>':'')+
        (dossier.notes?'<section><h2>Ghi chú</h2><p class="notes">'+escape(dossier.notes)+'</p></section>':'')+'</main></html>';
      downloadFile('kim-flora-ho-so-duyet-mau.html',documentHtml,'text/html');
    };
