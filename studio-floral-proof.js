    const floralProof = {
      types:{bouquet:'Bó hoa cưới',centerpiece:'Bình bàn tiệc',arch:'Cổng hoa',giftbox:'Hộp hoa'},
      roles:[
        ['main','Hoa chủ đạo','#D8B79E'],
        ['accent','Hoa điểm nhấn','#B86443'],
        ['filler','Hoa phụ','#EDE2D3'],
        ['foliage','Lá và cành','#5D7466'],
        ['vessel','Phụ kiện','#7C4330']
      ],
      photos:new Map(),
      original:false,
      frame:0,
      controls:'',
      signature:''
    };
    const proofNode = id => document.getElementById(id);
    const proofHex = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
    function floralProofColors() {
      const palette=state.palette.filter(swatch=>proofHex(swatch.hex));
      const sorted=[...palette].sort((a,b)=>b.ratio-a.ratio);
      const foliage=sorted.find(({hex})=>{
        const {r,g,b}=hexToRgb(hex),{h,s}=rgbToHsl(r,g,b);
        return h>=75 && h<=165 && s>=12;
      });
      const flowers=sorted.filter(swatch=>swatch!==foliage);
      const defaults=[flowers[0],flowers[1]??flowers[0],flowers[2]??flowers[1]??flowers[0],
        foliage??sorted[3],flowers[3]];
      const colors=floralProof.roles.map(([key,,fallback],index)=>
        palette.find(swatch=>swatch.id===state.mockupRoles?.[key])?.hex ?? defaults[index]?.hex ?? fallback);
      return {palette,colors};
    }

    function paintProofControls(type, palette, colors) {
      for(const button of proofNode('mockupTypeButtons').children){
        button.setAttribute('aria-pressed',String(button.dataset.mockup===type));
      }
      proofNode('floralProofName').textContent=floralProof.types[type];
      const compare=proofNode('floralProofOriginal');
      compare.setAttribute('aria-pressed',String(floralProof.original));
      compare.textContent=floralProof.original?'Xem bản phối màu':'Xem ảnh mẫu gốc';
      const signature=JSON.stringify([palette.map(s=>[s.id,s.hex]),colors,state.mockupRoles]);
      if(signature===floralProof.controls)return;
      floralProof.controls=signature;
      const controls=proofNode('mockupRoleMapping');
      const active=document.activeElement?.id;
      controls.replaceChildren(...floralProof.roles.map(([key,label],index)=>{
        const row=document.createElement('div');
        row.className='floral-proof-role';
        const swatch=document.createElement('span');
        swatch.className='floral-proof-swatch';
        swatch.style.backgroundColor=colors[index];
        const field=document.createElement('label');
        const select=document.createElement('select');
        select.id='floralProofRole-'+key;
        field.append(label,select);
        select.add(new Option('Tự động · '+colors[index],''));
        palette.forEach(swatch=>select.add(new Option(swatch.hex,String(swatch.id))));
        if(palette.some(swatch=>swatch.id===state.mockupRoles?.[key]))select.value=state.mockupRoles[key];
        select.onchange=()=>{
          const assignments={...state.mockupRoles};
          if(select.value)assignments[key]=palette.find(swatch=>String(swatch.id)===select.value).id;
          else delete assignments[key];
          state.mockupRoles=assignments;
          floralProof.original=false;
          renderFloralMockup();
          persist();
        };
        row.append(swatch,field);
        return row;
      }));
      if(active?.startsWith('floralProofRole-'))proofNode(active)?.focus({preventScroll:true});
    }

    function prepareFloralPhoto(img,type) {
      const scratch=document.createElement('canvas');
      scratch.width=img.naturalWidth;
      scratch.height=img.naturalHeight;
      const ctx=scratch.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0);
      const original=ctx.getImageData(0,0,scratch.width,scratch.height);
      const data=original.data, count=data.length/4;
      const groups=new Int8Array(count).fill(-1), coverage=new Float32Array(count);
      const totals=new Float64Array(5), weights=new Float64Array(5);
      for(let p=0;p<count;p++){
        const i=4*p,r=data[i],g=data[i+1],b=data[i+2];
        const {h,s,l}=rgbToHsl(r,g,b);
        const darkBlue=h>=195&&h<278&&l<49;
        const minimum=darkBlue?7:12;
        if(s<minimum || l>96 || l<5)continue;
        let group;
        if(darkBlue)group=4;
        else if(h<12||h>=307)group=0;
        else if(type==='arch'&&h>=36&&h<65&&s<51)group=4;
        else if(h<38||(h<59&&s>=48))group=1;
        else if(h<175)group=3;
        else if(h<254)group=4;
        else group=2;
        const amount=Math.min(1,(s-minimum)/(darkBlue?10:17));
        const light=.2126*r+.7152*g+.0722*b;
        groups[p]=group;
        coverage[p]=amount;
        totals[group]+=amount*light;
        weights[group]+=amount;
      }
      const light=Array.from(totals,(total,i)=>total/(weights[i]||1));
      return {original,groups,coverage,light};
    }

    function loadFloralPhoto(type) {
      if(!floralProof.photos.has(type)){
        const img=new Image();
        img.src='/floral-proofs/'+type+'.webp';
        floralProof.photos.set(type,img.decode().then(()=>prepareFloralPhoto(img,type)).catch(error=>{
          floralProof.photos.delete(type);
          throw error;
        }));
      }
      return floralProof.photos.get(type);
    }

    function drawFloralProof(photo, colors, original) {
      const {width,height,data}=photo.original;
      const canvas=proofNode('floralMockupCanvas'),ctx=canvas.getContext('2d');
      if(canvas.width!==width)canvas.width=width;
      if(canvas.height!==height)canvas.height=height;
      if(original){ctx.putImageData(photo.original,0,0);return;}
      const next=new ImageData(new Uint8ClampedArray(data),width,height);
      const palette=colors.map(hex=>{
        const {r,g,b}=hexToRgb(hex);
        return [r,g,b];
      });
      for(let p=0;p<photo.groups.length;p++){
        const group=photo.groups[p];
        if(group<0)continue;
        const i=p*4, strength=photo.coverage[p];
        const value=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
        const shade=(value-photo.light[group])/255;
        for(let channel=0;channel<3;channel++){
          const target=palette[group][channel];
          const adjusted=target+shade*(shade>0?255-target:target)*1.35;
          next.data[i+channel]=data[i+channel]+strength*(adjusted-data[i+channel]);
        }
      }
      ctx.putImageData(next,0,0);
    }

    function renderFloralMockup() {
      const type=Object.hasOwn(floralProof.types,state.mockupType)?state.mockupType:'bouquet';
      const {palette,colors}=floralProofColors();
      paintProofControls(type,palette,colors);
      const signature=JSON.stringify([type,colors,floralProof.original]);
      if(signature===floralProof.signature)return;
      floralProof.signature=signature;
      cancelAnimationFrame(floralProof.frame);
      const status=proofNode('floralProofStatus'),download=proofNode('floralProofExport');
      download.disabled=true;
      floralProof.frame=requestAnimationFrame(async()=>{
        if(!floralProof.photos.has(type))status.textContent='Đang tải ảnh mẫu…';
        try{
          const photo=await loadFloralPhoto(type);
          if(signature!==floralProof.signature)return;
          drawFloralProof(photo,colors,floralProof.original);
          status.textContent='';
          download.disabled=floralProof.original;
        }catch{
          if(signature!==floralProof.signature)return;
          floralProof.signature='';
          status.textContent='Chưa tải được ảnh mẫu. Chọn lại mẫu để thử lại.';
        }
      });
    }

    for(const button of proofNode('mockupTypeButtons').children){
      button.onclick=()=>{
        state.mockupType=button.dataset.mockup;
        renderFloralMockup();
        persist();
      };
    }
    proofNode('floralProofReset').onclick=()=>{
      delete state.mockupRoles;
      floralProof.original=false;
      renderFloralMockup();
      persist();
    };
    proofNode('floralProofOriginal').onclick=()=>{
      floralProof.original=!floralProof.original;
      renderFloralMockup();
    };
    proofNode('floralProofExport').onclick=()=>{
      const canvas=proofNode('floralMockupCanvas');
      const type=state.mockupType;
      canvas.toBlob(blob=>{
        if(!blob)return;
        const link=document.createElement('a');
        link.download='kim-flora-'+type+'.png';
        link.href=URL.createObjectURL(blob);
        link.click();
        setTimeout(()=>URL.revokeObjectURL(link.href),10000);
      },'image/png');
    };
