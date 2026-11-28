import {pose,layerBlendModes} from './floral-layer-render.js';
export function objectTools(parent,parts,env,selectTool,nextId){
  const box=document.createElement('fieldset');box.className='object-tools';parent.append(box);
  box.innerHTML=`<legend>Chỉnh đối tượng</legend><strong></strong><div class="layer-composite"></div><label>Màu cánh hoa <input type="color"></label><label>Mã HEX <input class="hex" placeholder="#B97691" maxlength="7"></label><button type="button" data-a="natural">Màu nguyên bản</button><div class="grades"></div><h3>Vị trí và bố cục</h3><div class="positions"></div><nav></nav>`;
  const q=s=>box.querySelector(s),grades={},fields={};let active=null,drag=null;
  const selected=()=>env().s?.layers?.find(l=>l.id===active);
  function mutate(fn){const l=selected();if(!l||l.locked)return;fn(l);env().commit();env().paint();}
  function label(parent,name,ctrl){const el=document.createElement('label');el.append(name,ctrl);parent.append(el);return el;}
  const compositing=q('.layer-composite');
  const layerName=document.createElement('input');layerName.type='text';layerName.maxLength=100;
  label(compositing,'Tên lớp',layerName);
  layerName.onchange=()=>mutate(layer=>{layer.name=layerName.value.trim()||layer.name;});
  const opacity=document.createElement('input');opacity.type='range';opacity.min=0;opacity.max=100;opacity.setAttribute('aria-label','Độ mờ');
  const opacityLabel=label(compositing,'Độ mờ',opacity);
  const opacityValue=document.createElement('output');
  opacityLabel.prepend(opacityValue);
  opacity.oninput=()=>{
    const layer=selected();
    if(!layer||layer.locked)return;
    layer.opacity=Number(opacity.value);
    opacityValue.value=layer.opacity+'%';
    env().schedule();
  };
  opacity.onchange=()=>env().commit();
  const blend=document.createElement('select');
  for(const [value,name] of Object.entries(layerBlendModes))blend.add(new Option(name,value));
  label(compositing,'Chế độ hòa trộn',blend);
  blend.onchange=()=>mutate(layer=>{layer.blend=blend.value;});
  for(const [key,title] of Object.entries({hue:'Sắc độ (Hue)',saturation:'Độ bão hòa',brightness:'Độ sáng',temperature:'Nhiệt độ màu',contrast:'Tương phản',highlights:'Vùng sáng',shadows:'Vùng tối'})){
    const input=document.createElement('input');input.type='range';input.min=key==='hue'?-180:-100;input.max=-input.min;
    const holder=label(q('.grades'),title,input),output=document.createElement('output');holder.prepend(output);grades[key]={input,output};
    input.oninput=()=>{const l=selected();if(l&&!l.locked){(l.color??={})[key]=+input.value;output.value=input.value;env().schedule();}};
    input.onchange=()=>env().commit();
  }
  for(const [key,title] of Object.entries({x:'Ngang (px)',y:'Dọc (px)',angle:'Góc xoay (°)',scale:'Kích thước (%)'})){
    const input=document.createElement('input');input.type='number';input.step='1';if(key==='scale'){input.min=1;input.max=1000;}
    fields[key]=input;label(q('.positions'),title,input);input.onchange=()=>{if(input.value&&input.validity.valid)mutate(l=>l[key]=+input.value/(key==='scale'?100:1));refresh();};
  }
  const actions={move:'Kéo đối tượng',flipX:'Lật ngang lớp',flipY:'Lật dọc lớp',front:'Tiến một lớp',back:'Lùi một lớp',cx:'Căn giữa ngang',cy:'Căn giữa dọc',spaceX:'Đều khoảng ngang',spaceY:'Đều khoảng dọc',copy:'Nhân bản lớp',del:'Xóa lớp'};
  for(const [k,title] of Object.entries(actions)){const b=document.createElement('button');b.type='button';b.dataset.a=k;b.textContent=title;q('nav').append(b);}
  q('input[type=color]').onchange=e=>mutate(l=>(l.color??={}).hex=e.target.value.toUpperCase());
  q('.hex').onchange=e=>{const hex=e.target.value.trim().replace(/^#/,'');if(/^[\da-f]{6}$/i.test(hex))mutate(l=>(l.color??={}).hex='#'+hex.toUpperCase());else env().message.textContent='Nhập đủ sáu ký tự HEX, ví dụ #B97691.';};
  function bounds(l,s){
    const p=parts.get(l.key),m=new DOMMatrix(s.m).multiply(pose(l,p));
    const pts=[[0,0],[p.w,0],[0,p.h],[p.w,p.h]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
    const xs=pts.map(v=>v.x),ys=pts.map(v=>v.y);
    return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  function shift(l,s,dx,dy){const m=new DOMMatrix(s.m).inverse();l.x=(l.x||0)+m.a*dx+m.c*dy;l.y=(l.y||0)+m.b*dx+m.d*dy;}
  box.onclick=e=>{const a=e.target.closest('button')?.dataset.a;if(!a)return;
    mutate(l=>{const s=env().s,ls=s.layers,i=ls.indexOf(l),b=bounds(l,s);
      if(a==='natural')delete l.color;
      if(a==='move')selectTool('move');
      if(a==='flipX')l.mirrorX=!l.mirrorX;
      if(a==='flipY')l.mirrorY=!l.mirrorY;
      if(a==='cx')shift(l,s,s.w/2-b.x-b.w/2,0);
      if(a==='cy')shift(l,s,0,s.h/2-b.y-b.h/2);
      if(a==='copy'){const copy=structuredClone(l);copy.copy=true;copy.id=nextId();copy.name+=' (bản sao)';copy.x=(copy.x||0)+10;ls.splice(i+1,0,copy);active=copy.id;}
      if(a==='del'){if(!l.copy)(s.removed??=[]).push(l.key);ls.splice(i,1);active=ls.at(-1)?.id;}
      if(a==='front'||a==='back'){const j=i+(a==='front'?1:-1);if(ls[j])[ls[i],ls[j]]=[ls[j],ls[i]];}
      if(a==='spaceX'||a==='spaceY'){
        const axis=a==='spaceX'?'x':'y',size=axis==='x'?'w':'h';
        const items=ls.filter(x=>!x.locked&&x.visible).map(l=>({l,b:bounds(l,s)})).sort((u,v)=>u.b[axis]-v.b[axis]);
        if(items.length<3){env().message.textContent='Cần ít nhất ba lớp đang hiện và mở khóa để chia đều khoảng cách.';return;}
        const start=items[0].b[axis],end=items.at(-1).b[axis]+items.at(-1).b[size];
        const gap=(end-start-items.reduce((n,v)=>n+v.b[size],0))/(items.length-1);let pos=start;
        for(const item of items){const delta=pos-item.b[axis];shift(item.l,s,axis==='x'?delta:0,axis==='y'?delta:0);pos+=item.b[size]+gap;}
      }
    });
  };
  function refresh(){
    const l=selected();box.hidden=!l;if(!l)return;box.disabled=l.locked||env().before;q('strong').textContent=l.name;
    layerName.value=l.name;
    opacity.value=l.opacity??100;
    opacityValue.value=opacity.value+'%';
    blend.value=Object.hasOwn(layerBlendModes,l.blend)?l.blend:'source-over';
    const color=l.color||{};q('.hex').value=color.hex||'';q('input[type=color]').value=color.hex||'#888888';
    for(const [k,{input,output}] of Object.entries(grades))input.value=output.value=color[k]||0;
    for(const [k,input] of Object.entries(fields))input.value=Math.round(k==='scale'?(l.scale||1)*100:l[k]||0);
  }
  function pointer(kind,p){const {s,commit,schedule}=env();
    if(kind==='down'){drag=null;for(const l of [...s.layers||[]].reverse()){
      if(!l.visible||l.locked)continue;const part=parts.get(l.key),v=p.matrixTransform(pose(l,part).inverse()),x=Math.floor(v.x),y=Math.floor(v.y);
      if(x>=0&&y>=0&&x<part.w&&y<part.h&&part.alpha[y*part.w+x]){active=l.id;drag={l,p,x:l.x||0,y:l.y||0};break;}}
    }else if(drag){if(kind==='move'||kind==='up'){drag.l.x=drag.x+p.x-drag.p.x;drag.l.y=drag.y+p.y-drag.p.y;}
      if(kind==='cancel'){drag.l.x=drag.x;drag.l.y=drag.y;}
      if(kind==='up'||kind==='cancel'){drag=null;commit();}}
    schedule();return true;
  }
  return {pointer,refresh,select(id){active=id;refresh();}};
}
