const localKeys = [
  'kim_flora_lab_v1', 'kim-flora-lab-projects-v1',
  'kim-flora-color-formulas-v1', 'kim_flora_composition_reports_v1'
];
const databases = {
  'kim-flora-color-studio': {formulas:'id'},
  'kim-flora-composition-notes': {reviews:'id'},
  'kim-flora-photo-projects': {originals:null, versions:'id', catalog:'id'}
};
const chunkSize = 480000;
const requestValue = request => new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
function connect(name, layout) {
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>{
    for(const [store,keyPath] of Object.entries(layout)) request.result.createObjectStore(store,keyPath?{keyPath}:undefined);
  };
  return requestValue(request);
}
function transactionDone(transaction) {
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve;
    transaction.onabort=()=>reject(transaction.error);
  });
}
function base64(bytes) {
  const blocks=[];
  for(let i=0;i<bytes.length;i+=8192) blocks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return btoa(blocks.join(''));
}
const bytesOf = value => Uint8Array.from(atob(value), char=>char.charCodeAt(0));

async function capture() {
  const local=Object.fromEntries(localKeys.map(key=>[key,localStorage.getItem(key)]));
  const stores={};
  const binaries=[];
  async function encode(value) {
    if(value instanceof Blob){
      const binary=binaries.length;
      binaries.push({content:base64(new Uint8Array(await value.arrayBuffer())),type:value.type,
        name:value instanceof File?value.name:null, modified:value instanceof File?value.lastModified:null});
      return {__kimFloraBackupBinary:binary};
    }
    if(value instanceof ImageData){
      return {__kimFloraBackupImageData:await encode(value.data),width:value.width,height:value.height,colorSpace:value.colorSpace};
    }
    if(value instanceof Uint8Array || value instanceof Uint8ClampedArray){
      return {__kimFloraBackupBytes:base64(value),clamped:value instanceof Uint8ClampedArray};
    }
    if(Array.isArray(value)) {
      const rows=[];
      for(const item of value) rows.push(await encode(item));
      return rows;
    }
    if(value && typeof value==='object'){
      const entries=[];
      for(const [key,item] of Object.entries(value)) entries.push([key,await encode(item)]);
      return Object.fromEntries(entries);
    }
    return value;
  }
  for(const [name,layout] of Object.entries(databases)){
    const db=await connect(name,layout);
    try {
      stores[name]={};
      const tx=db.transaction(Object.keys(layout));
      const records=await Promise.all(Object.keys(layout).map(async store=>{
        const source=tx.objectStore(store);
        return [store,...await Promise.all([requestValue(source.getAllKeys()),requestValue(source.getAll())])];
      }));
      for(const [store,keys,rows] of records) stores[name][store]=await encode(keys.map((key,index)=>[key,rows[index]]));
    } finally {db.close();}
  }
  if(Object.values(local).every(value=>value===null) &&
     Object.values(stores).every(layout=>Object.values(layout).every(rows=>!rows.length))) return null;
  return {version:1,local,stores,binaries};
}

async function call(query='', body) {
  const response=await fetch('/api/content-backups'+query,body?{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  }:{cache:'no-store'});
  if(!response.ok) throw Error('Online backup unavailable');
  return response.json();
}
async function digest(data) {
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function upload(snapshot, known) {
  const stream=new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'));
  const data=new Uint8Array(await new Response(stream).arrayBuffer());
  const id=await digest(data);
  if(id===known)return id;
  const count=Math.ceil(data.length/chunkSize);
  if(count>999)throw Error('Backup too large');
  for(let part=0;part<count;part+=4){
    await Promise.all(Array.from({length:Math.min(4,count-part)},(_,offset)=>{
      const index=part+offset;
      return call('',{snapshot:id,part:index,data:base64(data.subarray(index*chunkSize,(index+1)*chunkSize))});
    }));
  }
  await call('',{snapshot:id,part:-1,data:String(count)});
  return id;
}
async function download({id,parts}) {
  const buffers=[];
  for(let part=0;part<parts;part+=4){
    buffers.push(...await Promise.all(Array.from({length:Math.min(4,parts-part)},async (_,offset)=>{
      const row=await call('?snapshot='+id+'&part='+(part+offset));
      return bytesOf(row.data);
    })));
  }
  const blob=new Blob(buffers);
  if(await digest(await blob.arrayBuffer())!==id)throw Error('Backup integrity check failed');
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).json();
}
async function restore(snapshot) {
  if(snapshot.version!==1)throw Error('Unsupported backup');
  const binaries=snapshot.binaries.map(item=>{
    const data=bytesOf(item.content);
    return item.name!==null?new File([data],item.name,{type:item.type,lastModified:item.modified}):new Blob([data],{type:item.type});
  });
  const decode=value=>{
    if(Array.isArray(value))return value.map(decode);
    if(value && typeof value==='object'){
      if(Object.hasOwn(value,'__kimFloraBackupBinary'))return binaries[value.__kimFloraBackupBinary];
      if(Object.hasOwn(value,'__kimFloraBackupBytes')){
        const bytes=bytesOf(value.__kimFloraBackupBytes);
        return value.clamped?new Uint8ClampedArray(bytes.buffer):bytes;
      }
      if(Object.hasOwn(value,'__kimFloraBackupImageData')){
        return new ImageData(decode(value.__kimFloraBackupImageData),value.width,value.height,{colorSpace:value.colorSpace});
      }
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
    }
    return value;
  };
  for(const [name,layout] of Object.entries(databases)){
    const db=await connect(name,layout);
    try {
      const tx=db.transaction(Object.keys(layout),'readwrite');
      const done=transactionDone(tx);
      try {
        for(const [store,keyPath] of Object.entries(layout)){
          const target=tx.objectStore(store);
          for(const [key,row] of snapshot.stores[name][store]){
            if(keyPath)target.put(decode(row));
            else target.put(decode(row),key);
          }
        }
      } catch(error){tx.abort();await done.catch(()=>{});throw error;}
      await done;
    } finally {db.close();}
  }
  for(const key of localKeys){
    const value=snapshot.local[key];
    if(typeof value==='string')localStorage.setItem(key,value);
  }
}

const button=document.getElementById('openContentBackups');
const status=document.getElementById('contentBackupStatus');
const dialog=document.getElementById('contentBackupDialog');
const history=document.getElementById('contentBackupHistory');
let enabled=false, timer, active=null, dirty=false, lastId=null;
function schedule() {
  dirty=true;
  if(!enabled || active)return;
  clearTimeout(timer);
  timer=setTimeout(()=>sync().catch(()=>{}),1800);
}
function sync() {
  clearTimeout(timer);
  if(active)return active;
  dirty=false;
  active=(async()=>{
    status.textContent='Đang lưu trực tuyến…';
    const snapshot=await capture();
    if(snapshot)lastId=await upload(snapshot,lastId);
    status.textContent=snapshot?'Đã lưu trực tuyến.':'Chưa có nội dung để sao lưu.';
  })().catch(error=>{
    dirty=true;
    status.textContent='Chưa lưu trực tuyến. Dữ liệu vẫn ở trình duyệt này.';
    throw error;
  }).finally(()=>{
    active=null;
    if(dirty && !status.textContent.startsWith('Chưa lưu trực tuyến'))schedule();
  });
  return active;
}
async function showHistory(offset=0) {
  history.textContent='Đang tải lịch sử…';
  try{
    const rows=await call('?offset='+offset);
    history.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li');
      const open=document.createElement('button');
      open.type='button';
      open.className='underline';
      open.textContent='Khôi phục '+new Date(row.date).toLocaleString('vi-VN');
      open.onclick=async()=>{
        if(!confirm('Khôi phục bản này? Dữ liệu đang có sẽ được sao lưu trực tuyến trước.'))return;
        open.disabled=true;
        const guard=document.createElement('dialog');
        guard.textContent='Đang khôi phục dữ liệu…';
        guard.oncancel=event=>event.preventDefault();
        document.body.append(guard);
        guard.showModal();
        try{
          const snapshot=await download(row);
          await sync();
          await sync();
          await restore(snapshot);
          location.reload();
        }catch{
          status.textContent='Chưa khôi phục được. Bản lưu trực tuyến vẫn còn.';
          open.disabled=false;
        }finally{guard.remove();}
      };
      item.append(open);history.append(item);
    }
    if(!rows.length)history.textContent=offset?'Không còn bản lưu cũ hơn.':'Chưa có bản lưu trực tuyến.';
    for(const [label,target] of [['Bản mới hơn',offset-50],['Bản cũ hơn',offset+50]]){
      if(target<0 || (target>offset && rows.length<50))continue;
      const item=document.createElement('li');
      const link=document.createElement('button');
      link.type='button';link.className='underline';link.textContent=label;
      link.onclick=()=>showHistory(target);
      item.append(link);history.append(item);
    }
  }catch{history.textContent='Chưa đọc được kho lưu trực tuyến.';}
}
button.onclick=()=>{dialog.showModal();showHistory();};
document.getElementById('saveContentBackup').onclick=()=>sync().then(()=>showHistory()).catch(()=>{});
window.addEventListener('studio:ready',()=>{enabled=true;schedule();});
window.addEventListener('studio:storage-saved',schedule);
window.addEventListener('studio:before-logout',event=>{
  if(!enabled || (!dirty && !active))return;
  event.detail.push((async()=>{if(active)await active;if(dirty)await sync();})());
});
window.addEventListener('online',()=>{if(enabled)schedule();});
window.addEventListener('focus',()=>{if(enabled)schedule();});
window.addEventListener('storage',event=>{if(localKeys.includes(event.key))schedule();});

if(document.getElementById('authGateOverlay').hidden){enabled=true;schedule();}
