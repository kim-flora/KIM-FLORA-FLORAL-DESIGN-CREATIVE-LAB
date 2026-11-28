    const drawingNode = id => document.getElementById(id);
    const drawingMode = drawingNode('recipeWorkspaceMode');
    const drawingBoard = drawingNode('technicalBoard');
    let drawingView = 'front', selectedCluster = null, drawingRecipe;
    const drawingLimits = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
    function technicalViewData(){
      return state.recipe.technicalDrawing?.[drawingView] ??
        {width:120,height:drawingView==='front'?180:90,clusters:[]};
    }
    function technicalMaterialChoices(){
      const quantities=new Map();
      for(const line of state.recipe.items)quantities.set(line.invId,(quantities.get(line.invId)??0)+Number(line.qty||0));
      return new Map(state.inventory.filter(item=>quantities.has(item.id))
        .map(item=>[item.id,item.name+' · '+quantities.get(item.id)+' '+item.unit+'/SP']));
    }
    function refreshTechnicalDrawing(){
      if(drawingMode.value!=='drawing')return;
      if(drawingRecipe!==state.recipe){drawingRecipe=state.recipe;selectedCluster=null;}
      const view=technicalViewData();
      const active=view.clusters.find(cluster=>cluster.id===selectedCluster);
      const heightLabel=drawingView==='front'?'Cao':'Sâu';
      drawingNode('technicalRecipeName').textContent=state.recipe.name;
      drawingNode('technicalWidth').value=view.width;
      drawingNode('technicalHeight').value=view.height;
      drawingNode('technicalHeightLabel').textContent=heightLabel+' (cm)';
      drawingNode('technicalDimensions').textContent=view.width+' × '+view.height+' cm · Tọa độ tính từ góc trên bên trái';
      drawingBoard.style.setProperty('--technical-ratio',view.width+'/'+view.height);
      drawingBoard.style.setProperty('--technical-max',Math.min(1600,500*view.width/view.height)+'px');
      drawingBoard.replaceChildren(...view.clusters.map((cluster,index)=>{
        const point=document.createElement('button');
        point.type='button';point.className='technical-cluster';point.textContent=index+1;
        point.setAttribute('aria-label','Cụm '+(index+1)+' '+cluster.name);
        point.setAttribute('aria-pressed',String(cluster.id===selectedCluster));
        point.title=cluster.name;
        point.style.left=cluster.x/view.width*100+'%';
        point.style.top=cluster.y/view.height*100+'%';
        point.style.width=cluster.diameter/view.width*100+'%';
        point.style.height=cluster.diameter/view.height*100+'%';
        point.onclick=()=>{selectedCluster=cluster.id;refreshTechnicalDrawing();};
        attachDrawingDrag(point,cluster);
        return point;
      }));
      drawingNode('technicalFields').hidden=!active;
      drawingNode('technicalEmpty').hidden=!!active;
      drawingNode('technicalEmpty').textContent=view.clusters.length?'Chọn một cụm trên bản vẽ để chỉnh.':'Thêm một cụm hoa để đặt vị trí trên bản vẽ.';
      if(!active)return;
      for(const [field,key] of [['Name','name'],['X','x'],['Y','y'],['Diameter','diameter'],['Notes','notes']]){
        drawingNode('technical'+field).value=active[key];
      }
      drawingNode('technicalX').max=view.width;
      drawingNode('technicalY').max=view.height;
      drawingNode('technicalDiameter').max=Math.min(view.width,view.height);
      const picker=drawingNode('technicalMaterial'),choices=technicalMaterialChoices();
      picker.replaceChildren(new Option('Chưa liên kết',''),...[...choices].map(([id,label])=>new Option(label,id)));
      if(active.material&&!choices.has(active.material))picker.add(new Option('Vật tư không còn trong công thức',active.material));
      picker.value=active.material;
    }
    function saveTechnicalChange(mutate){
      const previous=state.recipe.technicalDrawing;
      const next=structuredClone(technicalViewData());
      mutate(next);
      state.recipe.technicalDrawing={...previous,[drawingView]:next};
      try{persist();}catch{
        if(previous===undefined)delete state.recipe.technicalDrawing;
        else state.recipe.technicalDrawing=previous;
        refreshTechnicalDrawing();
        drawingNode('technicalStatus').textContent='Chưa lưu được bản vẽ.';
        return;
      }
      refreshTechnicalDrawing();
      drawingNode('technicalStatus').textContent='Đã lưu bản vẽ vào công thức.';
    }
    function attachDrawingDrag(point,cluster){
      let drag;
      point.onpointerdown=event=>{
        if(event.button!==0)return;
        point.setPointerCapture(event.pointerId);
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      };
      point.onpointermove=event=>{
        if(drag?.id!==event.pointerId)return;
        if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
        drag.moved=true;
        const rect=drawingBoard.getBoundingClientRect();
        point.style.left=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100))+'%';
        point.style.top=Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))+'%';
      };
      point.onpointerup=event=>{
        if(drag?.id!==event.pointerId)return;
        const moved=drag.moved;drag=null;
        if(!moved)return;
        selectedCluster=cluster.id;
        saveTechnicalChange(view=>{
          const item=view.clusters.find(row=>row.id===cluster.id);
          item.x=drawingLimits(parseFloat(point.style.left)*view.width/100,0,view.width);
          item.y=drawingLimits(parseFloat(point.style.top)*view.height/100,0,view.height);
        });
      };
      point.onlostpointercapture=point.onpointercancel=()=>{if(drag?.moved)refreshTechnicalDrawing();drag=null;};
    }
    drawingMode.onchange=()=>{
      const show=drawingMode.value==='drawing';
      drawingNode('recipeCostingWorkspace').hidden=show;
      drawingNode('recipeCostingActions').hidden=show;
      drawingNode('technicalDrawing').hidden=!show;
      drawingNode('technicalStatus').textContent='';
      if(show)refreshTechnicalDrawing();
    };
    drawingNode('technicalView').onchange=event=>{
      drawingView=event.target.value;selectedCluster=null;
      drawingNode('technicalStatus').textContent='';
      refreshTechnicalDrawing();
    };
    for(const [id,key] of [['technicalWidth','width'],['technicalHeight','height']]){
      drawingNode(id).onchange=event=>{
        const value=event.target.valueAsNumber;
        if(!Number.isFinite(value)){refreshTechnicalDrawing();return;}
        saveTechnicalChange(view=>{
          view[key]=drawingLimits(value,10,5000);
          for(const cluster of view.clusters){
            cluster.x=Math.min(cluster.x,view.width);cluster.y=Math.min(cluster.y,view.height);
            cluster.diameter=Math.min(cluster.diameter,view.width,view.height);
          }
        });
      };
    }
    drawingNode('technicalAdd').onclick=()=>{
      selectedCluster=crypto.randomUUID();
      saveTechnicalChange(view=>{
        const offset=(view.clusters.length%5)*.075;
        view.clusters.push({id:selectedCluster,name:'Cụm hoa '+(view.clusters.length+1),material:'',
          x:Math.round(view.width*(.32+offset)),y:Math.round(view.height*(.40+offset)),
          diameter:Math.max(1,Math.round(Math.min(view.width,view.height)*.20)),notes:''});
      });
    };
    for(const [field,key] of [['Name','name'],['X','x'],['Y','y'],['Diameter','diameter'],['Notes','notes'],['Material','material']]){
      drawingNode('technical'+field).onchange=event=>{
        const input=event.target;
        if(input.type==='number'&&!Number.isFinite(input.valueAsNumber)){refreshTechnicalDrawing();return;}
        saveTechnicalChange(view=>{
          const cluster=view.clusters.find(item=>item.id===selectedCluster);
          if(!cluster)return;
          if(input.type==='number'){
            const max=key==='x'?view.width:key==='y'?view.height:Math.min(view.width,view.height);
            cluster[key]=drawingLimits(input.valueAsNumber,key==='diameter'?1:0,max);
          }else cluster[key]=key==='name'?input.value.trim()||'Cụm hoa':input.value;
        });
      };
    }
    drawingNode('technicalDelete').onclick=()=>{
      const remove=selectedCluster;
      selectedCluster=null;
      saveTechnicalChange(view=>{view.clusters=view.clusters.filter(cluster=>cluster.id!==remove);});
    };

    drawingNode('technicalExport').onclick=()=>{
      const view=technicalViewData(),materials=technicalMaterialChoices();
      const scale=Math.min(810/view.width,680/view.height);
      const width=view.width*scale,height=view.height*scale;
      const canvas=document.createElement('canvas');
      canvas.width=1040;
      const ctx=canvas.getContext('2d');
      ctx.font='16px system-ui';
      const notes=view.clusters.map(cluster=>{
        const rows=[];
        for(const paragraph of String(cluster.notes||'').split('\n')){
          let current='';
          for(const word of paragraph.split(/\s+/)){
            if(current&&ctx.measureText(current+' '+word).width>940){rows.push(current);current='';}
            current=current?current+' '+word:word;
          }
          if(current)rows.push(current);
        }
        return rows;
      });
      canvas.height=Math.ceil(height+160+view.clusters.reduce((sum,_,index)=>sum+42+notes[index].length*22,0));
      ctx.fillStyle='#fdfbf6';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#253c31';ctx.font='bold 24px system-ui';
      ctx.fillText('Bản vẽ kỹ thuật · '+state.recipe.name,32,40,970);
      ctx.font='16px system-ui';
      ctx.fillText((drawingView==='front'?'Chính diện':'Mặt bằng')+' · '+view.width+' × '+view.height+' cm',32,68);
      const x=(canvas.width-width)/2,y=90;
      ctx.strokeStyle='#cad3c8';
      for(let tick=0;tick<=10;tick++){
        ctx.beginPath();ctx.moveTo(x+width*tick/10,y);ctx.lineTo(x+width*tick/10,y+height);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,y+height*tick/10);ctx.lineTo(x+width,y+height*tick/10);ctx.stroke();
      }
      ctx.strokeStyle='#486052';ctx.strokeRect(x,y,width,height);
      ctx.save();
      ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
      for(const [index,cluster] of view.clusters.entries()){
        const px=x+cluster.x*scale,py=y+cluster.y*scale;
        ctx.beginPath();ctx.arc(px,py,Math.max(6,cluster.diameter*scale/2),0,Math.PI*2);
        ctx.fillStyle='#dce7d9';ctx.fill();ctx.stroke();
        ctx.fillStyle='#253c31';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(String(index+1),px,py);
      }
      ctx.restore();
      let row=y+height+32;
      for(const [index,cluster] of view.clusters.entries()){
        ctx.font='bold 16px system-ui';ctx.fillStyle='#253c31';
        ctx.fillText((index+1)+'. '+cluster.name+' · X '+cluster.x+' / Y '+cluster.y+' · Ø '+cluster.diameter+' cm',32,row,970);
        ctx.font='16px system-ui';row+=21;
        if(cluster.material)ctx.fillText(materials.get(cluster.material)??'Vật tư không còn trong công thức',32,row,970);
        for(const line of notes[index]){row+=22;ctx.fillText(line,32,row,970);}
        row+=21;
      }
      canvas.toBlob(blob=>{
        if(!blob)return showToast('Chưa xuất được bản vẽ PNG.', 'error');
        const link=document.createElement('a');link.download='kim-flora-ban-ve-'+drawingView+'.png';
        link.href=URL.createObjectURL(blob);link.click();
        setTimeout(()=>URL.revokeObjectURL(link.href),10000);
      },'image/png');
    };
