function measureStudioComposition(data,w,h,guides={}){
  const colors=flowerLeafSamples(data,w,h,1);
  const key=(r,g,b)=>(r<<16)|(g<<8)|b;
  const foreground=new Set(colors.map(c=>key(...c)));
  const mask=new Uint8Array(w*h),rows=new Array(h).fill(0),cols=new Array(w).fill(0);
  // Estimate floral detail at a neighbourhood scale. Smooth pedestal faces
  // may differ from the wall in colour but have little interior detail.
  const initial=new Uint8Array(w*h), texture=new Float32Array(w*h);
  let rawCount=0;
  for(let p=0;p<w*h;p++){
    const i=4*p;
    if(data[i+3]>=128 && foreground.has(key(data[i],data[i+1],data[i+2]))){initial[p]=1;rawCount++;}
  }
  const radius=Math.max(2,Math.round(Math.min(w,h)*.045));
  const stride=w+1,integral=new Float64Array(stride*(h+1));
  let detailed=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;
    let local=0;
    if(initial[p]&&x>0&&y>0&&initial[p-1]&&initial[p-w]){
      for(let c=0;c<3;c++)local+=Math.min(48,Math.abs(data[4*p+c]-data[4*(p-1)+c]))+Math.min(48,Math.abs(data[4*p+c]-data[4*(p-w)+c]));
      local/=6;
    }
    texture[p]=local;
    const seed=local>7?1:0;
    detailed+=seed;
    const j=(y+1)*stride+x+1;
    integral[j]=seed+integral[j-1]+integral[j-stride]-integral[j-stride-1];
  }
  function density(x,y,r){
    const l=Math.max(0,x-r),t=Math.max(0,y-r),rr=Math.min(w,x+r+1),bb=Math.min(h,y+r+1);
    return (integral[bb*stride+rr]-integral[t*stride+rr]-integral[bb*stride+l]+integral[t*stride+l])/((rr-l)*(bb-t));
  }
  // Look for a sustained pair of vertical material edges below the flower mass.
  // Limit subtraction to the space between the two edges; keep trailing stems outside.
  const supports=[];
  for(let x=2;x<w-2;x++){
    let start=0,hits=0,miss=0;
    for(let y=Math.floor(h*.52);y<=h;y++){
      const i=4*(y*w+x);
      const jump=y<h?Math.max(...[0,1,2].map(c=>Math.abs(data[i-8+c]-data[i+8+c]))):0;
      if(jump>28){if(!hits)start=y;hits++;miss=0;}
      else if(++miss>2||y===h){
        if(hits>=h*.12 && y>h*.73)supports.push({x,top:start,end:y-miss,length:hits});
        hits=0;miss=0;
      }
    }
  }
  let vessel=null,best=0;
  for(const l of supports)for(const r of supports){
    const span=r.x-l.x,top=Math.max(l.top,r.top),end=Math.min(l.end,r.end);
    if(span<w*.09||span>w*.5||end-top<h*.12||Math.abs(l.end-r.end)>h*.09)continue;
    const score=(end-top)*Math.sqrt(span)*(1-Math.abs(l.top-r.top)/h);
    if(score>best){best=score;vessel={l:l.x,r:r.x,top,end};}
  }
  const box=guides.box;
  const refine=detailed>Math.max(20,rawCount*.06);
  let n=0,sx=0,sy=0,xx=0,yy=0,xy=0,left=0;
  const zones=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x,i=4*p;
    if(!initial[p])continue;
    if(box && (x/w<Math.min(box.x1,box.x2)||x/w>Math.max(box.x1,box.x2)||y/h<Math.min(box.y1,box.y2)||y/h>Math.max(box.y1,box.y2)))continue;
    if(vessel && y>=vessel.top && y<=vessel.end+3 && x>=vessel.l-2 && x<=vessel.r+2)continue;
    if(refine && density(x,y,radius)<.075 && density(x,y,2*radius)<.13)continue;
    mask[p]=1;rows[y]++;cols[x]++;n++;sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;
    if(x<w/2)left++;
    const id=Math.floor(y/6)*Math.ceil(w/6)+Math.floor(x/6);
    const z=zones.get(id)||{x:0,y:0,count:0,strength:0};
    const j=4*(y*w+Math.min(w-1,x+2)),k=4*(Math.min(h-1,y+2)*w+x);
    let edge=0;
    for(let c=0;c<3;c++)edge+=Math.abs(data[i+c]-data[j+c])+Math.abs(data[i+c]-data[k+c]);
    z.strength+=(texture[p]+Math.min(edge/6,30))*(.25+density(x,y,2*radius));z.count++;z.x+=x;z.y+=y;zones.set(id,z);
  }
  const result={silhouettePoly:[],primaryFocal:null,secondaryFocal:null,flow:null};
  if(n<Math.max(12,w*h*.008)||n>w*h*.94)return result;
  const trim=(bins)=>{
    let a=0,b=bins.length-1,lo=0,hi=0;
    while(lo+bins[a]<=n*.012)lo+=bins[a++];
    while(hi+bins[b]<=n*.012)hi+=bins[b--];
    return [a,b];
  };
  const [x0,x1]=trim(cols),[y0,y1]=trim(rows);
  const width=x1-x0+1,height=y1-y0+1,rightEdge=[],leftEdge=[],bands=[0,0,0];
  let pairs=0,occupied=0;
  for(let y=y0;y<=y1;y++){
    let lo=w,hi=-1;
    for(let x=x0;x<=x1;x++)if(mask[y*w+x]){
      occupied++;if(mask[y*w+x0+x1-x])pairs++;
      lo=Math.min(x,lo);hi=Math.max(x,hi);
      bands[Math.min(2,Math.floor(3*(y-y0)/height))]++;
    }
    if(hi>=lo){leftEdge.push({x:lo/w,y:y/h});rightEdge.push({x:(hi+1)/w,y:y/h});}
  }
  result.silhouettePoly=leftEdge.concat(rightEdge.reverse());
  const ratio=height/width,fill=occupied/(width*height),mirror=pairs/Math.max(1,occupied);
  const mx=sx/n,my=sy/n,a=xx/n-mx*mx,b=yy/n-my*my,c=xy/n-mx*my;
  const anis=Math.hypot(a-b,2*c)/Math.max(1,a+b),angle=.5*Math.atan2(2*c,a-b);
  const dx=Math.cos(angle),dy=Math.sin(angle);
  if(anis>.45){
    const along=[];
    for(let p=0;p<mask.length;p++)if(mask[p])along.push((p%w-mx)*dx+(Math.floor(p/w)-my)*dy);
    along.sort((a,b)=>a-b);
    const low=along[Math.floor(.08*n)],high=along[Math.floor(.92*n)];
    result.flow={startX:(mx+low*dx)/w,startY:(my+low*dy)/h,midX:mx/w,midY:my/h,endX:(mx+high*dx)/w,endY:(my+high*dy)/h};
  }
  const scores=[...zones.values()].filter(z=>z.count>=5).map(z=>({cx:z.x/z.count/w,cy:z.y/z.count/h,score:z.strength/z.count*Math.sqrt(z.count/36)})).sort((a,b)=>b.score-a.score);
  // A local contrast maximum by itself often selects a twig. Pool over nearby
  // occupied cells so a coherent head of flowers can outweigh an isolated edge.
  const occupiedZones=[...zones.values()];
  for(const z of scores){
    let mass=0,detail=0;
    for(const cell of occupiedZones){
      const dist=Math.hypot(cell.x/cell.count-z.cx*w,cell.y/cell.count-z.cy*h);
      const weight=Math.exp(-dist*dist/(2*Math.pow(Math.max(4,Math.min(width,height)*.09),2)));
      mass+=weight*cell.count;detail+=weight*cell.strength;
    }
    z.score=.25*z.score+.75*detail/Math.sqrt(Math.max(1,mass))/9;
  }
  scores.sort((a,b)=>b.score-a.score);
  const peak=scores[0],baseline=scores[Math.floor(scores.length/2)]?.score||0;
  if(peak&&peak.score>Math.max(12,baseline*1.45)){
    result.primaryFocal=peak;result.secondaryFocal=scores.find(z=>z.score>Math.max(peak.score*.77,baseline*1.45)&&Math.hypot(z.cx-peak.cx,z.cy-peak.cy)>.24);
  }
  const shares=bands.map(k=>Math.round(100*k/Math.max(1,occupied)));
  const widest=shares.indexOf(Math.max(...shares)),position=['trên','giữa','dưới'][widest];
  const lp=Math.round(left/n*100),bg=Math.round(100*(1-n/(w*h)));
  const axis=Math.abs(dy)<.35?'ngang':Math.abs(dx)<.35?'dọc':dy>0?'chéo từ trên trái xuống dưới phải':'chéo từ dưới trái lên trên phải';
  // Locate the dense flower mass separately from its upright or trailing lines.
  const denseRows=rows.map((v,i)=>v+ (rows[i-1]||0)+(rows[i+1]||0));
  const corePeak=denseRows.indexOf(Math.max(...denseRows));
  const cutoff=denseRows[corePeak]*.65;
  let bodyTop=Math.max(y0,Math.min(y1,corePeak)),bodyBase=bodyTop;
  while(bodyTop>y0 && denseRows[bodyTop-1]>=cutoff)bodyTop--;
  while(bodyBase<y1 && denseRows[bodyBase+1]>=cutoff)bodyBase++;
  const upper=(bodyTop-y0)/height,lower=(y1-bodyBase)/height;
  const coreRatio=(bodyBase-bodyTop+1)/width;
  const extension=upper>.15&&lower>.15?'Có cả ngọn vươn và phần rủ dưới khối chính.':upper>.15?'Có nhánh vươn cao khỏi cụm chính.':lower>.15?'Có phần rủ xuống dưới cụm chính.':'Đường bao tập trung quanh cụm chính.';
  let gapArea=0,envelope=0;
  for(let y=y0;y<=y1;y++){
    const first=mask.subarray(y*w+x0,y*w+x1+1);
    const lo=first.indexOf(1),hi=first.lastIndexOf(1);
    if(lo<0)continue;
    envelope+=hi-lo+1;
    for(let i=lo;i<=hi;i++)if(!first[i])gapArea++;
  }
  const gapPct=Math.round(100*gapArea/Math.max(1,envelope));
  const clusters=[];
  for(const z of scores){
    if(z.score<=Math.max(8,baseline*1.15))break;
    if(clusters.every(p=>Math.hypot((z.cx-p.cx)*w/width,(z.cy-p.cy)*h/height)>.19))clusters.push(z);
    if(clusters.length===5)break;
  }
  const clusterText=clusters.length>=3?'Có '+clusters.length+' vùng chi tiết tách nhau. Quan sát khoảng nghỉ giữa các cụm để đối chiếu nhịp lặp.':clusters.length===2?'Hai vùng chi tiết nổi lên thành một cặp.':'Chưa đủ vùng chi tiết riêng biệt để xác định nhịp lặp.';
  const bodyForm=coreRatio<.82?'Khối chính bè ngang':coreRatio>1.25?'Khối chính kéo dọc':'Khối chính khá gọn, chiều cao gần chiều ngang';
  result.bodies=[
    `${bodyForm}. ${extension} ${fill<.48?'Đường bao thoáng, nhiều khe hở giữa các nhánh.':fill>.74?'Phần lớn diện tích trong đường bao được lấp đầy.':'Các mảng đặc xen với vùng hở trong đường bao.'}`,
    `${mirror>.79?'Hai nửa có hình bao khá tương ứng':mirror<.52?'Hai nửa có đường bao khác biệt rõ':'Hai nửa chỉ tương ứng một phần'} khi đối chiếu qua trục giữa khối. Mảng tập trung nhất nằm ở tầng ${position}; dải dày của khối trải từ ${Math.round(bodyTop/h*100)}% đến ${Math.round(bodyBase/h*100)}% chiều cao ảnh.`,
    `Cao/rộng toàn dáng ≈ ${ratio.toFixed(2)}. Riêng dải hoa dày, chiều cao bằng khoảng ${Math.round(coreRatio*100)}% bề ngang toàn dáng.`,
    peak&&result.primaryFocal?`Vùng có chi tiết tương phản nổi bật tại x=${Math.round(100*peak.cx)}%, y=${Math.round(100*peak.cy)}% khung ảnh. ${result.secondaryFocal?'Có thêm vùng nổi bật tách rời; kiểm tra hai vùng có tranh điểm nhấn khi nhìn từ xa.':'Thử đối chiếu dấu khoanh với cụm hoa bạn muốn người xem nhìn đầu tiên.'}`:'Chưa thấy vùng tương phản nổi trội đủ để khoanh điểm nhấn.',
    `So với đường giữa ảnh, phần diện tích nhận diện bên trái chiếm ${lp}%, bên phải ${100-lp}%. ${Math.abs(lp-50)<8?'Diện tích hai bên khá cân.':`Khối tập trung về phía ${lp>50?'trái':'phải'}.`}`,
    `${clusterText} Trong ba tầng bằng chiều cao, diện tích chủ thể phân bố ${shares.join(' / ')}% từ trên xuống. ${Math.max(...shares)-Math.min(...shares)<12?'Mật độ khá đều giữa các tầng.':`Nhịp đặc nhất ở tầng ${position}; xem các cành thưa kế bên tạo khoảng nghỉ ở đâu.`}`,
    result.flow?`Khối kéo dài theo trục ${axis}. Đường trên ảnh gợi hướng để đối chiếu với cành dẫn.`:'Các mảng trải theo nhiều hướng. Chưa thấy trục đủ rõ để vẽ đường dẫn.',
    `Vùng hoa lá nhận diện chiếm khoảng ${100-bg}% khung hình. Giữa hai mép ngoài của từng tầng hoa, khoảng hở chiếm khoảng ${gapPct}%.`
  ];
  // Trace actual mask boundaries, including interior openings.
  result.boundary=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;
    if(!mask[p])continue;
    if(x===0||x===w-1||y===0||y===h-1||!mask[p-1]||!mask[p+1]||!mask[p-w]||!mask[p+w])result.boundary.push([x/w,y/h]);
  }
  const directions=['phải','dưới phải','dưới','dưới trái','trái','trên trái','trên','trên phải'];
  const reaches=Array.from({length:8},()=>[]);
  for(let p=0;p<mask.length;p++)if(mask[p]){
    const vx=(p%w-mx)/width,vy=(Math.floor(p/w)-my)/width;
    reaches[(Math.round(Math.atan2(vy,vx)/(Math.PI/4))+8)%8].push(Math.hypot(vx,vy));
  }
  const arms=reaches.map((r,i)=>{
    r.sort((a,b)=>a-b);
    return {direction:directions[i],reach:r[Math.floor(r.length*.97)]||0,count:r.length};
  }).filter(z=>z.count>=Math.max(6,n*.018)).sort((a,b)=>b.reach-a.reach);
  if(arms.length && arms[0].reach>.45){
    result.bodies[0]+=' Biên vươn xa nhất về phía '+arms[0].direction+'.';
    if(!result.flow)result.bodies[6]='Từ khối chính, phần vươn dài nhất hướng '+arms[0].direction+
      (arms[1]?.reach>arms[0].reach*.82?', kèm hướng '+arms[1].direction:'')+'. Chưa xác định được một đường dẫn mắt liên tục.';
  }
  const dominant=scores.filter(z=>z.score>Math.max(10,baseline*1.6)&&!scores.some(other=>other.score>z.score&&Math.hypot((z.cx-other.cx)*w/width,(z.cy-other.cy)*h/height)<.18));
  if(dominant.length>=2){
    const gaps=dominant.map(z=>Math.min(...dominant.filter(other=>other!==z).map(other=>Math.hypot((z.cx-other.cx)*w,(z.cy-other.cy)*h))));
    const gapRatio=Math.max(...gaps)/Math.max(1,Math.min(...gaps));
    result.bodies[5]='Có '+dominant.length+' vùng tương phản cục bộ. '+(dominant.length===2?'Hai vùng tạo một cặp; chưa đủ để xác định nhịp lặp.':gapRatio>1.6?'Khoảng cách giữa các vùng biến đổi rõ: nhịp sít xen với khoảng nghỉ rộng hơn.':'Khoảng cách giữa các vùng khá đều, gợi nhịp lặp.')+' Vùng dày nhất nằm ở tầng '+position+'.';
  }else result.bodies[5]='Chưa thấy chuỗi điểm nhấn lặp đủ rõ. Mật độ ở ba tầng trên, giữa và dưới lần lượt là '+shares.join(' / ')+'%.';
  if(vessel)result.bodies[2]+=' Đã loại vùng chân đỡ có hai cạnh thẳng khỏi phép đo.';
  if(box)result.bodies[2]+=' Phạm vi tính theo vùng bạn khoanh.';
  if(guides.focal){
    const f=guides.focal;result.primaryFocal={cx:f.x1,cy:f.y1};result.secondaryFocal=null;
    result.bodies[3]='Điểm nhấn bạn xác nhận ở '+Math.round(f.x1*100)+'% ngang, '+Math.round(f.y1*100)+'% dọc. Tâm phân bố của vùng hoa lá ở '+Math.round(mx/w*100)+'%, '+Math.round(my/h*100)+'%.';
  }
  if(guides.flow){
    const f=guides.flow;
    result.flow={startX:f.x1,startY:f.y1,midX:(f.x1+f.x2)/2,midY:(f.y1+f.y2)/2,endX:f.x2,endY:f.y2};
    result.bodies[6]='Theo nét bạn xác nhận, đường dẫn đi từ ('+Math.round(f.x1*100)+'%, '+Math.round(f.y1*100)+'%) tới ('+Math.round(f.x2*100)+'%, '+Math.round(f.y2*100)+'%).';
  }
  return result;
}