import {mergeContent,sameContent} from './content-merge.js';

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
  async function encode(value) {
    if(value instanceof Blob){
      return {__kimFloraBackupFile:{content:base64(new Uint8Array(await value.arrayBuffer())),type:value.type,
        name:value instanceof File?value.name:null, modified:value instanceof File?value.lastModified:null}};
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
  return {version:2,local,stores};
}

async function call(query='', body) {
  const response=await fetch('/api/content-backups'+query,body?{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    signal:AbortSignal.timeout(30000)
  }:{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok){
    const error=Error('Online backup unavailable');
    error.status=response.status;
    throw error;
  }
  return response.json();
}
async function digest(data) {
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function upload(snapshot, known) {
  // Retain the existing archive format so earlier builds can still read backups.
  const binaries=[];
  const referenceFiles=value=>{
    if(Array.isArray(value))return value.map(referenceFiles);
    if(value && typeof value==='object'){
      if(Object.hasOwn(value,'__kimFloraBackupFile')){
        const index=binaries.length;
        binaries.push(value.__kimFloraBackupFile);
        return {__kimFloraBackupBinary:index};
      }
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,referenceFiles(item)]));
    }
    return value;
  };
  const archive={version:1,local:snapshot.local,stores:referenceFiles(snapshot.stores),binaries};
  const stream=new Blob([JSON.stringify(archive)]).stream().pipeThrough(new CompressionStream('gzip'));
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
  const snapshot=await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).json();
  if(snapshot.version===1){
    const replace=value=>{
      if(Array.isArray(value))return value.map(replace);
      if(value && typeof value==='object'){
        if(Object.hasOwn(value,'__kimFloraBackupBinary')){
          const file=snapshot.binaries[value.__kimFloraBackupBinary];
          if(!file)throw Error('Backup file is missing');
          return {__kimFloraBackupFile:file};
        }
        return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
      }
      return value;
    };
    return {version:2,local:snapshot.local,stores:replace(snapshot.stores)};
  }
  if(snapshot.version!==2)throw Error('Unsupported backup');
  return snapshot;
}
async function restore(snapshot) {
  const decode=value=>{
    if(Array.isArray(value))return value.map(decode);
    if(value && typeof value==='object'){
      if(Object.hasOwn(value,'__kimFloraBackupFile')){
        const {content,type,name,modified}=value.__kimFloraBackupFile;
        const data=bytesOf(content);
        return name!==null?new File([data],name,{type,lastModified:modified}):new Blob([data],{type});
      }
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
          target.clear();
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
    else localStorage.removeItem(key);
  }
}

const button=document.getElementById('openContentBackups');
const status=document.getElementById('contentBackupStatus');
const dialog=document.getElementById('contentBackupDialog');
const history=document.getElementById('contentBackupHistory');
const checkpoint='kim-flora-content-checkpoint-v2';
const recovery='kim-flora-content-recovery-v2';
let enabled=false, timer, active=null, dirty=false;

async function readSnapshot(id) {
  const {data}=await call('?snapshot='+id+'&part=-1');
  const parts=Number(data);
  if(!Number.isInteger(parts) || parts<1 || parts>999)throw Error('Invalid backup manifest');
  return download({id,parts});
}

async function applySnapshot(id, snapshot) {
  localStorage.setItem(recovery,id);
  await restore(snapshot);
  localStorage.setItem(checkpoint,id);
  localStorage.removeItem(recovery);
}

const exclusive = action => navigator.locks
  ? navigator.locks.request('kim-flora-content-sync',action)
  : action();

function schedule() {
  dirty=true;
  if(!enabled || active)return;
  clearTimeout(timer);
  timer=setTimeout(()=>sync().catch(()=>{}),1800);
}

function sync(hydration) {
  clearTimeout(timer);
  if(active)return active;
  dirty=false;
  let succeeded=false;
  active=exclusive(async()=>{
    status.textContent='Đang lưu trực tuyến…';
    const recoveryId=localStorage.getItem(recovery);
    if(recoveryId){
      if(!hydration?.allowed)throw Error('Reload required to finish restoration');
      const snapshot=await readSnapshot(recoveryId);
      if(!hydration.allowed)throw Error('Reload required to finish restoration');
      hydration.applying=true;
      await applySnapshot(recoveryId,snapshot);
      location.reload();
      return true;
    }
    const baseId=localStorage.getItem(checkpoint);
    let head=await call('?head=1');
    const legacyId=head.snapshot?null:(await call())[0]?.id;
    const local=await capture();
    const hasContent=Object.values(local.local).some(value=>value!==null) ||
      Object.values(local.stores).some(stores=>Object.values(stores).some(rows=>rows.length));
    if(!baseId && !hasContent && !head.snapshot && !legacyId){
      status.textContent='Chưa có nội dung để sao lưu.';
      succeeded=true;
      return false;
    }
    const localId=baseId || hasContent?await upload(local,baseId):null;
    const base=baseId && localId!==baseId?await readSnapshot(baseId):local;
    for(let attempt=0;attempt<4;attempt++){
      const remoteId=head.snapshot ?? legacyId;
      const remote=remoteId===localId?local:remoteId?await readSnapshot(remoteId):null;
      // A browser whose local copy is unchanged must never publish it over the head.
      const {snapshot,conflicted}=baseId && localId===baseId && remote
        ? {snapshot:remote,conflicted:false}
        : mergeContent(baseId?base:null,local,remote);
      const id=snapshot===remote?remoteId:snapshot===local?localId:await upload(snapshot,remoteId);
      if(id!==head.snapshot){
        try{await call('?head=1',{snapshot:id,revision:head.revision});}
        catch(error){
          if(error.status!==409)throw error;
          head=await call('?head=1');
          continue;
        }
      }
      if(hydration?.allowed && id!==localId && !sameContent(snapshot,local)){
        // Keep edits made in another tab during the network requests.
        if(!sameContent(await capture(),local)){
          dirty=true;
        }else if(hydration.allowed){
          hydration.applying=true;
          await applySnapshot(id,snapshot);
          location.reload();
          return true;
        }
      }
      if(localId)localStorage.setItem(checkpoint,localId);
      succeeded=true;
      status.textContent=conflicted
        ? 'Có thay đổi trùng nhau. Bản của trình duyệt này còn trong lịch sử sao lưu.'
        : id===localId?'Đã lưu trực tuyến.':'Đã lưu trực tuyến. Tải lại trang để xem dữ liệu chung.';
      return false;
    }
    throw Error('Concurrent updates');
  }).catch(error=>{
    dirty=true;
    status.textContent='Chưa kết nối được kho trực tuyến.';
    throw error;
  }).finally(()=>{
    active=null;
    if(dirty && succeeded)schedule();
  });
  return active;
}
function describeBackup(snapshot) {
  let studio={};
  try{studio=JSON.parse(snapshot.local.kim_flora_lab_v1??'{}')??{};}catch{}
  const stored=(database,store)=>snapshot.stores?.[database]?.[store]?.length??0;
  const count=value=>Array.isArray(value)?value.length:0;
  return [
    ['Dự án Studio',count(studio.savedProjects)],
    ['Bảng màu đã lưu',count(studio.savedColorRecipes)+stored('kim-flora-color-studio','formulas')],
    ['Công thức đã lưu',count(studio.savedRecipes)],
    ['Mã nguyên liệu',count(studio.inventory)],
    ['Mục Moodboard',count(studio.moodboardItems)],
    ['Hồ sơ bố cục',stored('kim-flora-composition-notes','reviews')],
    ['Phiên bản dự án ảnh',stored('kim-flora-photo-projects','catalog')]
  ].map(([label,total])=>label+' '+total).join(' · ');
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
          await exclusive(async()=>{
            const head=await call('?head=1');
            await call('?head=1',{snapshot:row.id,revision:head.revision});
            await applySnapshot(row.id,snapshot);
          });
          location.reload();
        }catch{
          status.textContent='Chưa khôi phục được. Bản lưu trực tuyến vẫn còn.';
          open.disabled=false;
        }finally{guard.remove();}
      };
      const preview=document.createElement('button');
      preview.type='button';
      preview.className='ml-3 underline';
      preview.textContent='Xem nội dung';
      const details=document.createElement('p');
      details.className='my-1 text-xs';
      details.setAttribute('role','status');
      preview.onclick=async()=>{
        preview.disabled=true;
        details.textContent='Đang đọc bản sao…';
        try{details.textContent=describeBackup(await download(row));}
        catch{details.textContent='Chưa đọc được nội dung bản sao này.';}
        finally{preview.disabled=false;}
      };
      item.append(open,preview,details);history.append(item);
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
document.getElementById('loadSharedContent').onclick=async event=>{
  const control=event.currentTarget;
  control.disabled=true;
  try{
    if(active && await active)return;
    if(!(await sync({allowed:true,applying:false}))){
      history.textContent='Trình duyệt đã được đối chiếu với bản trực tuyến.';
    }
  }catch{
    history.textContent='Chưa tải được dữ liệu dùng chung. Hãy thử lại khi kết nối ổn định.';
  }finally{control.disabled=false;}
};
document.getElementById('saveContentBackup').onclick=()=>sync().then(()=>showHistory()).catch(()=>{});
window.addEventListener('studio:before-ready',event=>{
  const hydration={allowed:true,applying:false};
  event.detail.push(new Promise((resolve,reject)=>{
    const controller=new AbortController();
    const cancelHydration=()=>{hydration.allowed=false;};
    const timer=setTimeout(()=>{
      if(hydration.applying)return;
      if(localStorage.getItem(recovery)){
        reject(Error('Đã đăng nhập. Hãy tải lại trang để hoàn tất khôi phục dữ liệu.'));
      }else{
        for(const type of ['pointerdown','keydown','studio:storage-saved']){
          window.addEventListener(type,cancelHydration,{capture:true,signal:controller.signal});
        }
        status.textContent='Đang tải dữ liệu dùng chung…';
        resolve(false);
      }
    },6000);
    sync(hydration).then(resolve,()=>{
      if(localStorage.getItem(recovery)){
        reject(Error('Đã đăng nhập. Hãy tải lại trang để hoàn tất khôi phục dữ liệu.'));
      }else resolve(false);
    }).finally(()=>{clearTimeout(timer);controller.abort();});
  }));
});
window.addEventListener('studio:ready',()=>{enabled=true;if(dirty)schedule();});
window.addEventListener('studio:storage-saved',schedule);
window.addEventListener('studio:before-logout',event=>{
  if(!enabled || (!dirty && !active))return;
  event.detail.push((async()=>{if(active)await active;if(dirty)await sync();})());
});
window.addEventListener('online',()=>{if(enabled)schedule();});
window.addEventListener('focus',()=>{if(enabled)schedule();});
window.addEventListener('storage',event=>{if(localKeys.includes(event.key))schedule();});

setInterval(()=>{
  if(enabled && !document.hidden && !active)sync().catch(()=>{});
},60000);
