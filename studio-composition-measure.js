function measureStudioComposition(data,w,h){
  const colors=flowerLeafSamples(data,w,h,1);
  const key=(r,g,b)=>(r<<16)|(g<<8)|b;
  const foreground=new Set(colors.map(c=>key(...c)));
  const mask=new Uint8Array(w*h),rows=new Array(h).fill(0),cols=new Array(w).fill(0);
  let n=0,sx=0,sy=0,xx=0,yy=0,xy=0,left=0;
  const zones=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x,i=4*p;
    if(data[i+3]<128||!foreground.has(key(data[i],data[i+1],data[i+2])))continue;
    mask[p]=1;rows[y]++;cols[x]++;n++;sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;
    if(x<w/2)left++;
    const id=Math.floor(y/6)*Math.ceil(w/6)+Math.floor(x/6);
    const z=zones.get(id)||{x:0,y:0,count:0,strength:0};
    const j=4*(y*w+Math.min(w-1,x+2)),k=4*(Math.min(h-1,y+2)*w+x);
    let edge=0;
    for(let c=0;c<3;c++)edge+=Math.abs(data[i+c]-data[j+c])+Math.abs(data[i+c]-data[k+c]);
    z.strength+=edge/6;z.count++;z.x+=x;z.y+=y;zones.set(id,z);
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
  const peak=scores[0],baseline=scores[Math.floor(scores.length/2)]?.score||0;
  if(peak&&peak.score>Math.max(12,baseline*1.45)){
    result.primaryFocal=peak;result.secondaryFocal=scores.find(z=>z.score>Math.max(peak.score*.77,baseline*1.45)&&Math.hypot(z.cx-peak.cx,z.cy-peak.cy)>.24);
  }
  const shares=bands.map(k=>Math.round(100*k/Math.max(1,occupied)));
  const widest=shares.indexOf(Math.max(...shares)),position=['trên','giữa','dưới'][widest];
  const form=ratio>1.25?'Dáng vươn cao':ratio<.80?'Dáng trải ngang':'Khối có chiều cao và ngang gần nhau';
  const lp=Math.round(left/n*100),bg=Math.round(100*(1-n/(w*h)));
  const axis=Math.abs(dy)<.35?'ngang':Math.abs(dx)<.35?'dọc':dy>0?'chéo từ trên trái xuống dưới phải':'chéo từ dưới trái lên trên phải';
  result.bodies=[
    `${form}. ${fill<.48?'Đường bao thoáng, nhiều khe hở giữa các nhánh.':fill>.74?'Phần lớn diện tích trong đường bao được lấp đầy.':'Các mảng đặc xen với vùng hở trong đường bao.'}`,
    `${mirror>.79?'Hai nửa có hình bao khá tương ứng':mirror<.52?'Hai nửa có đường bao khác biệt rõ':'Hai nửa chỉ tương ứng một phần'} khi đối chiếu qua trục giữa khối. Mảng tập trung nhất nằm ở tầng ${position}.`,
    `Cao/rộng của vùng chủ thể ước lượng ≈ ${ratio.toFixed(2)}. Phép đo có thể gồm bình và các vật liệu cùng màu với hoa.`,
    peak&&result.primaryFocal?`Vùng có chi tiết tương phản nổi bật tại x=${Math.round(100*peak.cx)}%, y=${Math.round(100*peak.cy)}% khung ảnh. ${result.secondaryFocal?'Có thêm vùng nổi bật tách rời; kiểm tra hai vùng có tranh điểm nhấn khi nhìn từ xa.':'Thử đối chiếu dấu khoanh với cụm hoa bạn muốn người xem nhìn đầu tiên.'}`:'Chưa thấy vùng tương phản nổi trội đủ để khoanh điểm nhấn.',
    `So với đường giữa ảnh, phần diện tích nhận diện bên trái chiếm ${lp}%, bên phải ${100-lp}%. ${Math.abs(lp-50)<8?'Diện tích hai bên khá cân.':`Khối tập trung về phía ${lp>50?'trái':'phải'}.`}`,
    `Trong ba tầng bằng chiều cao, diện tích chủ thể phân bố ${shares.join(' / ')}% từ trên xuống. ${Math.max(...shares)-Math.min(...shares)<12?'Mật độ khá đều giữa các tầng.':`Nhịp đặc nhất ở tầng ${position}; xem các cành thưa kế bên tạo khoảng nghỉ ở đâu.`}`,
    result.flow?`Khối kéo dài theo trục ${axis}. Đường trên ảnh gợi hướng để đối chiếu với cành dẫn.`:'Các mảng trải theo nhiều hướng. Chưa thấy trục đủ rõ để vẽ đường dẫn.',
    `Khoảng ${bg}% toàn khung gần màu nền. Riêng bên trong khung bao chủ thể, phần hở ước lượng ${Math.round(100*(1-fill))}%.`
  ];
  return result;
}