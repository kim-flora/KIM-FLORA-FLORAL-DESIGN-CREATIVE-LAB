    const assessmentNode = id => document.getElementById(id);
    const assessmentHex = value => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value);
    const assessmentDecimal = new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1});
    const assessmentNumber = value => value==null?'—':assessmentDecimal.format(value);
    const assessmentPercent = value => value==null?'—':assessmentNumber(value)+'%';

    function proportionalShares(weights, units=1000) {
      const total=weights.reduce((sum,value)=>sum+value,0);
      if(!total)return weights.map(()=>0);
      const exact=weights.map(value=>value*units/total);
      const shares=exact.map(Math.floor);
      const remainder=units-shares.reduce((sum,value)=>sum+value,0);
      const order=exact.map((value,index)=>index).sort((a,b)=>(exact[b]-shares[b])-(exact[a]-shares[a]));
      for(const index of order.slice(0,remainder))shares[index]++;
      return shares.map(value=>value*100/units);
    }

    function measuredColors() {
      const measurement=state.colorMeasurement;
      if(!['full','focus'].includes(measurement?.scope)||!Array.isArray(measurement.colors))return [];
      return measurement.colors.filter(color=>assessmentHex(color?.hex)&&Number.isFinite(color.percent)&&color.percent>=0);
    }

    function measuredColorWeights(palette, measured) {
      const available=new Map();
      for(const {hex,percent} of measured){
        const key=hex.toUpperCase();
        available.set(key,(available.get(key)??0)+percent);
      }
      return palette.map(swatch=>{
        const key=swatch.hex?.toUpperCase();
        const value=available.get(key)??null;
        available.delete(key);
        return value;
      });
    }

    function applyMeasuredColorRatios() {
      const weights=measuredColorWeights(state.palette,measuredColors());
      const coverage=weights.reduce((sum,value)=>sum+(value??0),0);
      if(!coverage){
        showToast('Hãy tách lại màu từ ảnh để có tỷ lệ đo khớp với bảng màu.', 'info');
        return false;
      }
      const ratios=proportionalShares(weights.map(value=>value??0),100);
      state.palette.forEach((swatch,index)=>{swatch.ratio=ratios[index];});
      if(coverage<100)showToast('Đã quy về 100% từ các màu đo còn khớp trong bản phối.', 'info');
      return true;
    }

    function loadColorRecipeSource(recipe) {
      paletteRequest?.abort();
      state.currentImageDataUrl=recipe.image||null;
      state.colorMeasurement=recipe.image?structuredClone(recipe.colorMeasurement??null):null;
      if(recipe.image){
        loadImageToColorStudio(recipe.image,true);
      }else{
        colorRequest++;
        paletteImage=null;
        colorCanvas.classList.add('hidden');
        colorZoomTools.classList.add('hidden');
        assessmentNode('colorUploadPrompt').classList.remove('hidden');
      }
    }

    const academySource='https://github.com/kim-flora/hocvienhoakimflora/blob/0f940ec/index.html.html#L9281';
    const academyCatalog=academyColors.map(([hex,name,family,tone,character,elegant])=>{
      const {r,g,b}=hexToRgb(hex);
      return {hex,name,family,tone,character,elegant,lab:rgbToLab(r,g,b)};
    });
    const academyDistance=(a,b)=>Math.hypot(a.L-b.L,a.a-b.a,a.b-b.b);
    function studioColorName(hex) {
      const {r,g,b}=hexToRgb(hex),lab=rgbToLab(r,g,b);
      if(lab.C<8)return lab.L<23?'Đen than':lab.L<48?'Xám đậm':lab.L<75?'Xám trung tính':lab.L<94?'Xám sáng':'Trắng';
      return academyCatalog.reduce((best,sample)=>
        academyDistance(sample.lab,lab)<academyDistance(best.lab,lab)?sample:best).name;
    }
    function displayStudioColorName(swatch) {
      return /^Màu ảnh #?\d+$/i.test(swatch.name??'')&&assessmentHex(swatch.hex)
        ? studioColorName(swatch.hex) : swatch.name??'';
    }

    const academyGoals=[
      ['Dịu hơn',(sample,lab)=>sample.character==='Dịu'&&sample.lab.C<lab.C-2&&sample.lab.L>=lab.L-4],
      ['Trầm hơn',(sample,lab)=>sample.character==='Trầm'&&sample.lab.L<lab.L-3],
      ['Sang hơn',(sample)=>sample.elegant]
    ];

    function academyAssessment(hex,lab) {
      const ranked=academyCatalog.map(sample=>({sample,distance:academyDistance(sample.lab,lab)}))
        .sort((a,b)=>a.distance-b.distance);
      const reference=ranked[0].sample;
      const used=new Set([hex.toUpperCase()]);
      const suggestions=academyGoals.map(([goal,accept])=>{
        let best,score=Infinity;
        for(const {sample,distance} of ranked){
          if(used.has(sample.hex.toUpperCase())||!accept(sample,lab))continue;
          const cost=distance+(sample.family===reference.family?0:12);
          if(cost<score){best=sample;score=cost;}
        }
        if(!best)return {goal};
        used.add(best.hex.toUpperCase());
        return {goal,hex:best.hex,name:best.name,family:best.family,lightness:best.lab.L,chroma:best.lab.C};
      });
      return {reference:reference.name,referenceHex:reference.hex,tone:reference.tone,
        character:reference.character,family:reference.family,suggestions};
    }

    function currentColorAssessment() {
      const measured=measuredColors();
      const palette=state.palette.filter(swatch=>assessmentHex(swatch.hex));
      const weights=palette.map(swatch=>Math.max(0,Number(swatch.ratio)||0));
      const total=weights.reduce((sum,value)=>sum+value,0);
      const proportions=proportionalShares(weights);
      const imageWeights=measuredColorWeights(palette,measured);
      const ranked=weights.map((_,index)=>index).filter(index=>weights[index]>0).sort((a,b)=>weights[b]-weights[a]);
      const entries=palette.map((swatch,index)=>{
        const rgb=hexToRgb(swatch.hex), lab=rgbToLab(rgb.r,rgb.g,rgb.b);
        const role=ranked[0]===index?'Chủ đạo':ranked[1]===index?'Màu phụ chính':weights[index]?'Bổ trợ':'Chưa phân bổ';
        return {hex:swatch.hex,name:displayStudioColorName(swatch),academy:academyAssessment(swatch.hex,lab),ratio:proportions[index],inputRatio:weights[index],
          imagePercent:imageWeights[index],rgb,lab,role};
      });
      const lead=entries[ranked[0]],secondary=entries[ranked[1]];
      const average=key=>total?entries.reduce((sum,item)=>sum+item.lab[key]*item.inputRatio,0)/total:null;
      const averageLightness=average('L'),averageChroma=average('C');
      const tone=averageLightness>=68?'thiên sáng':averageLightness<43?'thiên trầm':'có độ sáng trung bình';
      const vividness=averageChroma>=45?'khá rực':averageChroma<24?'dịu và ít chói':'có độ rực vừa phải';
      const difference=secondary?Math.abs(lead.lab.L-secondary.lab.L):null;
      const summary=lead
        ? 'Tổng thể bản phối '+tone+', '+vividness+'. Dùng '+lead.hex+' ('+assessmentPercent(lead.ratio)+') làm mảng màu chính.'+
          (secondary?' Dùng '+secondary.hex+' ('+assessmentPercent(secondary.ratio)+') để nối hoặc làm nổi bật mảng chính.':'')
        :'Đặt tỷ lệ lớn hơn 0 để đánh giá bản phối.';
      const advice=difference==null?'Cần ít nhất hai màu có tỷ lệ dương để so sánh độ sáng.'
        :difference<12?'Hai màu lớn nhất có độ sáng gần nhau. Nếu muốn điểm nhấn rõ, thử đặt một màu sáng hơn hoặc tối hơn cạnh hoa chủ đạo.'
        :difference>=25?'Hai màu lớn nhất có độ sáng cách xa nhau. Đặt chúng cạnh nhau ở vùng muốn hút mắt và dùng màu phụ để chuyển sắc.'
        :'Hai màu lớn nhất có chênh lệch độ sáng vừa phải. Thử nhắc lại màu phụ ở vài điểm để tạo nhịp.';
      return {measured,academySource,scope:measured.length?state.colorMeasurement.scope:null,total,entries,
        averageLightness,averageChroma,difference,summary,advice};
    }

    const measurementScopeText = scope => scope==='focus'?'Vùng ưu tiên hoa':'Toàn bộ khung hình';
    function assessmentElement(tag,text) {
      const node=document.createElement(tag);
      if(text!=null)node.textContent=text;
      return node;
    }

    function drawColorTrack(barId,legendId,entries) {
      const bar=assessmentNode(barId),legend=assessmentNode(legendId);
      bar.replaceChildren();
      legend.replaceChildren();
      for(const {hex,percent} of entries){
        if(percent>0){
          const segment=assessmentElement('div');
          segment.style.width=percent+'%';
          segment.style.backgroundColor=hex;
          segment.title=hex+' · '+assessmentPercent(percent);
          bar.append(segment);
        }
        const item=assessmentElement('span',hex+' · '+assessmentPercent(percent));
        const chip=assessmentElement('i');
        chip.className='color-analysis-chip';
        chip.style.backgroundColor=hex;
        item.prepend(chip);
        legend.append(item);
      }
    }

    function academyChip(hex) {
      const chip=assessmentElement('i');
      chip.className='color-analysis-chip';
      chip.style.backgroundColor=hex;
      return chip;
    }

    function renderAcademyTones(entries) {
      const ordered=[...entries].sort((a,b)=>b.lab.L-a.lab.L);
      const strongest=[...entries].sort((a,b)=>b.lab.C-a.lab.C)[0];
      const panel=assessmentNode('academyToneHighlights');
      panel.replaceChildren();
      for(const [label,entry] of [
        ['Sáng nhất',ordered[0]],['Tối nhất',ordered.at(-1)],['Độ rực cao nhất',strongest]
      ]){
        if(!entry)continue;
        const card=assessmentElement('div');
        const swatch=assessmentElement('span',entry.hex+' · '+entry.academy.character);
        swatch.prepend(academyChip(entry.hex));
        card.append(assessmentElement('strong',label),swatch);
        panel.append(card);
      }
    }

    function renderColorAnalysisAndMockup() {
      const result=currentColorAssessment();
      const {measured,entries,scope,difference}=result;
      assessmentNode('imageProportionScope').textContent=scope
        ? measurementScopeText(scope)+' · Ước tính theo điểm ảnh'
        :'Chưa có số đo xác nhận. Hãy tách lại màu.';
      document.querySelector('[data-ratio="image"]').disabled=!entries.some(entry=>entry.imagePercent>0);
      drawColorTrack('imageProportionBar','imageProportionLegend',measured);
      const metrics=assessmentNode('mathKpiGrid');
      metrics.replaceChildren();
      for(const [name,value,help] of [
        ['Độ sáng L*',result.averageLightness,'Bình quân theo tỷ lệ phối. L* từ 0 (đen) đến 100 (trắng).'],
        ['Độ rực C*',result.averageChroma,'Bình quân CIELAB theo tỷ lệ phối. Giá trị cao hơn cho biết màu cách xa sắc trung tính hơn.'],
        ['Chênh sáng ΔL*',difference,'Chênh lệch độ sáng giữa hai màu có tỷ lệ phối lớn nhất.']
      ]){
        const item=assessmentElement('div');
        item.title=help;
        item.append(assessmentElement('dt',name),assessmentElement('dd',assessmentNumber(value)));
        metrics.append(item);
      }
      renderAcademyTones(entries);
      assessmentNode('aestheticSummary').textContent=result.summary;
      assessmentNode('practicalPairingTip').textContent=result.advice;
      const table=assessmentNode('colorMathTableBody');
      table.replaceChildren();
      for(const entry of entries){
        const row=assessmentElement('tr');
        for(const value of [entry.hex,assessmentPercent(entry.imagePercent),assessmentPercent(entry.ratio),
          assessmentNumber(entry.lab.L),assessmentNumber(entry.lab.C),entry.academy.tone+' · '+entry.academy.character,entry.role])row.append(assessmentElement('td',value));
        const chip=assessmentElement('i');
        chip.className='color-analysis-chip';
        chip.style.backgroundColor=entry.hex;
        row.firstChild.prepend(chip);
        table.append(row);
      }
      renderFloralMockup();
    }

    const escapeColorReportText = value => String(value??'').replace(/[&<>"']/g,ch=>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);

    function exportStudioColorReport(format) {
      const result=currentColorAssessment();
      const project=state.projectName, exportedAt=new Date().toISOString();
      if(format==='json'){
        downloadFile('kim_flora_color_profile.json',JSON.stringify({project,exportedAt,...result},null,2),'application/json');
        return;
      }
      const rows=result.entries.map(entry=>'<tr>'+[
        entry.hex,assessmentPercent(entry.imagePercent),assessmentPercent(entry.ratio),
        [entry.rgb.r,entry.rgb.g,entry.rgb.b].join(', '),assessmentNumber(entry.lab.L),assessmentNumber(entry.lab.a),assessmentNumber(entry.lab.b),
        assessmentNumber(entry.lab.C),entry.academy.tone+' · '+entry.academy.character,entry.role
      ].map(value=>'<td>'+escapeColorReportText(value)+'</td>').join('')+'</tr>').join('');
      const scope=result.scope?measurementScopeText(result.scope)+' · Ước tính theo điểm ảnh':'Chưa có số đo xác nhận.';
      const measured=result.measured.map(color=>color.hex+' '+assessmentPercent(color.percent)).join(' · ');
      const headings=['Mã HEX','Đo từ ảnh','Tỷ lệ phối','RGB','L*','a*','b*','C*','Sắc độ tham chiếu','Vai trò'];
      const source=state.currentImageDataUrl;
      const preview=typeof source==='string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source)
        ? '<img alt="Ảnh nguồn" src="'+source+'">' : '';
      const html='<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hồ sơ màu · Kim Flora</title>'+
        '<style>body{font:16px system-ui;color:#24372d;padding:24px;max-width:900px;margin:auto}img{max-width:min(350px,100%)}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}th{background:#f4efe5}table{width:100%}</style>'+
        '<h1>Hồ sơ màu · Kim Flora</h1><p>'+escapeColorReportText(project)+' · '+escapeColorReportText(new Date(exportedAt).toLocaleString('vi-VN'))+
        '</p>'+preview+'<h2>Đo từ ảnh</h2><p>'+escapeColorReportText(scope)+'</p><p>'+escapeColorReportText(measured)+'</p>'+
        '<h2>Bản phối hiện tại</h2><p>Tổng đã nhập '+assessmentPercent(result.total)+'. Tỷ lệ phối được quy về 100% khi có phân bổ.</p>'+
        '<table><thead><tr>'+headings.map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+
        '<h2>Đánh giá sắc độ</h2><p>L* '+assessmentNumber(result.averageLightness)+' · C* '+assessmentNumber(result.averageChroma)+
        ' · ΔL* '+assessmentNumber(result.difference)+'</p><p>'+escapeColorReportText(result.summary)+'</p><p>'+escapeColorReportText(result.advice)+'</p>'+
        '<h2>Màu thay thế</h2><ul>'+result.entries.map(entry=>'<li>'+escapeColorReportText(entry.hex)+' · '+
          escapeColorReportText(entry.academy.suggestions.filter(item=>item.hex)
            .map(item=>item.goal+': '+item.name+' '+item.hex).join(' · '))+'</li>').join('')+
        '</ul><p><a href="'+academySource+'">Thư viện 192 màu · Học Viện Hoa Kim Flora</a></p>';
      downloadFile('kim_flora_color_profile.html',html,'text/html');
    }

    assessmentNode('btnExportColorDossier').onclick=()=>{
      showModal({
        title:'Xuất hồ sơ màu',
        bodyHtml:'<label for="colorReportFormat">Định dạng</label> <select id="colorReportFormat" class="border rounded px-2 py-1"><option value="html">HTML</option><option value="json">JSON</option></select>',
        confirmText:'Tải hồ sơ',
        onConfirm:()=>exportStudioColorReport(assessmentNode('colorReportFormat').value)
      });
    };
