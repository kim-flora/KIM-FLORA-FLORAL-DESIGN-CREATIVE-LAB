function database(){
  return new Promise((resolve,reject)=>{const r=indexedDB.open('kim-flora-photo-projects',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('originals');r.result.createObjectStore('versions',{keyPath:'id'});r.result.createObjectStore('catalog',{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
function result(r){return new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
export function projectPanel(root,env){
  const panel=document.createElement('section');panel.className='flower-projects';
  panel.innerHTML=`<h3>Dự án ảnh</h3><label>Tên dự án <input class="project-name"></label>
    <button class="save-version" type="button">Lưu phiên bản</button>
    <label>Phiên bản trên thiết bị <select></select></label><button class="reopen" type="button">Mở phiên bản</button>`;
  root.append(panel);const name=panel.querySelector('input'),sel=panel.querySelector('select'),save=panel.querySelector('.save-version'),open=panel.querySelector('.reopen');
  let db,projectId=null,pending=false,refreshId=0;
  const ready=()=>db??=(database().catch(err=>{db=null;throw err;}));
  async function refresh(preferred){
    const id=++refreshId,conn=await ready(),rows=await result(conn.transaction('catalog').objectStore('catalog').getAll());
    if(id!==refreshId)return;sel.replaceChildren();for(const row of rows.sort((a,b)=>b.time-a.time)){sel.add(new Option(row.name+' · '+new Date(row.time).toLocaleString('vi-VN'),row.id));}
    if(preferred)sel.value=preferred;open.disabled=pending||!sel.value;
  }
  save.onclick=async()=>{const e=env();if(!e.file||pending)return;pending=true;save.disabled=open.disabled=true;
    const pid=projectId??=crypto.randomUUID(),id=crypto.randomUUID(),title=name.value.trim()||e.name,time=Date.now();
    try{const shot=e.snapshot(),conn=await ready(),tx=conn.transaction(['originals','versions','catalog'],'readwrite');
      const originals=tx.objectStore('originals'),request=originals.getKey(pid);request.onsuccess=()=>{if(request.result===undefined)originals.add(e.file,pid);};
      tx.objectStore('versions').add({id,pid,title,...shot});tx.objectStore('catalog').add({id,name:title,time});
      await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});await refresh(id);e.message.textContent='Đã lưu phiên bản dự án trên thiết bị.';
    }catch{e.message.textContent='Chưa lưu được phiên bản. Kiểm tra dung lượng hoặc quyền lưu của trình duyệt.';}
    finally{pending=false;update();}
  };
  open.onclick=async()=>{if(!sel.value||pending)return;const e=env(),ticket=e.begin();pending=true;save.disabled=open.disabled=true;
    try{const conn=await ready(),v=await result(conn.transaction('versions').objectStore('versions').get(sel.value)),file=await result(conn.transaction('originals').objectStore('originals').get(v.pid));
      if(await e.restore(file,v,ticket)){projectId=v.pid;name.value=v.title;e.message.textContent='Đã mở phiên bản để chỉnh tiếp.';}
    }catch{e.message.textContent='Không mở được phiên bản này.';}finally{pending=false;update();}
  };
  function update(){save.disabled=pending||!env().file;open.disabled=pending||!sel.value;}
  refresh().catch(()=>{env().message.textContent='Trình duyệt chưa cho phép mở kho dự án ảnh.';});
  return {update,newImage(title){projectId=null;name.value=title;}};
}
