function flowerLeafSamples(data,width,height,step,connectedBackground=false) {
  // Model colours that recur along the frame, including multicoloured backdrops.
  const bins=16, size=bins*bins*bins;
  const border=new Float64Array(size), inside=new Float64Array(size);
  const ids=new Uint16Array(width*height);
  let edgeCount=0, innerCount=0;
  const band=Math.max(1,Math.round(Math.min(width,height)*0.055));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,i=p*4;
    if(data[i+3]<128)continue;
    const id=((data[i]>>4)*16+(data[i+1]>>4))*16+(data[i+2]>>4);
    ids[p]=id;
    if(x<band||y<band||x>=width-band||y>=height-band){border[id]++;edgeCount++;}
    else{inside[id]++;innerCount++;}
  }
  const smooth=(hist,id)=>{
    const r=id>>8,g=(id>>4)&15,b=id&15;
    let sum=0;
    for(let dr=-1;dr<=1;dr++)for(let dg=-1;dg<=1;dg++)for(let db=-1;db<=1;db++){
      if(r+dr<0||r+dr>15||g+dg<0||g+dg>15||b+db<0||b+db>15)continue;
      sum+=hist[id+dr*256+dg*16+db]*Math.pow(.28,Math.abs(dr)+Math.abs(dg)+Math.abs(db));
    }
    return sum;
  };
  const background=new Uint8Array(size);
  for(let id=0;id<size;id++){
    if(!border[id]&&!inside[id])continue;
    const edge=smooth(border,id)/Math.max(1,edgeCount);
    const core=smooth(inside,id)/Math.max(1,innerCount);
    if(edge>.0008 && edge>core*.36)background[id]=1;
  }
  if(connectedBackground){
    const size=width*height, mask=new Uint8Array(size);
    const perimeter=size-Math.max(0,width-2*band)*Math.max(0,height-2*band);
    if(edgeCount<perimeter*.4)return mask;
    const queue=new Int32Array(size);
    let end=0;
    function visit(p){
      if(mask[p]||data[p*4+3]<128||!background[ids[p]])return;
      mask[p]=1;
      queue[end++]=p;
    }
    for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
    for(let y=1;y<height-1;y++){visit(y*width);visit(y*width+width-1);}
    for(let i=0;i<end;i++){
      const p=queue[i],x=p%width;
      if(x>0)visit(p-1);
      if(x+1<width)visit(p+1);
      if(p>=width)visit(p-width);
      if(p+width<size)visit(p+width);
    }
    return mask;
  }
  const samples=[];
  for(let p=0;p<ids.length;p+=step){
    const i=p*4;
    if(data[i+3]>=128&&!background[ids[p]])samples.push([data[i],data[i+1],data[i+2]]);
  }
  return samples;
}