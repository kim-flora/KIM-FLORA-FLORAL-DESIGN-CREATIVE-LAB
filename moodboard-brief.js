function generateDmDirectionText() {
  const dm = state.designMoodboard;
  const palette = dm.images?.length && dm.extractedColors?.length ? dm.extractedColors : state.palette || [];
  const weights = new Map();
  for (const item of palette) {
    if (!/^#[0-9a-f]{6}$/i.test(item.hex)) continue;
    const key = item.hex.toUpperCase();
    weights.set(key, (weights.get(key) || 0) + Math.max(0, Number(item.ratio) || 0));
  }
  const colors = Array.from(weights, ([hex, weight]) => {
    const {r,g,b} = hexToRgb(hex);
    return {hex, weight, ...rgbToHsl(r,g,b)};
  }).filter(c=>c.weight>0).sort((a,b)=>b.weight-a.weight);
  const box = document.getElementById('dmDirectionBox');
  if (!colors.length) {box.textContent='Chọn ảnh hoặc bảng màu để tạo định hướng.'; return;}
  const total = colors.reduce((n,c)=>n+c.weight,0);
  const base = colors[0];
  const lightness = colors.reduce((n,c)=>n+c.weight*c.l,0)/total;
  const span = Math.max(...colors.map(c=>c.l))-Math.min(...colors.map(c=>c.l));
  const accent = [...colors].sort((a,b)=>(b.s+Math.abs(b.l-base.l))-(a.s+Math.abs(a.l-base.l)))[0];
  const cool = accent.h>=165 && accent.h<295;
  const mood = lightness<37?'Dồn sắc trầm vào lớp sâu. Chừa một mặt hoa sáng phía trước để mắt có chỗ dừng.':lightness>69?'Giữ khoảng sáng liên tục giữa các bông; đặt sắc đậm nhất ở một cụm nhỏ để phom vẫn nhẹ.':span>40?'Gom hai sắc sáng và tối thành mảng tiếp xúc cạnh cụm chính để tạo điểm nhìn rõ.':`Nối các sắc gần nhau bằng lớp cánh chồng nhẹ. Tạo điểm nhấn bằng ${cool?'mặt hoa lớn giữa các cành mảnh':'sự thay đổi kích thước giữa hoa nở và nụ'}.`;
  function flowers(c) {
    if(c.s<13 || c.l>93)return c.l<40?'lá khô nâu xám hoặc cành mộc':'cát tường trắng hoặc hồng kem';
    if(c.h<18 || c.h>=348)return c.l<45?'thược dược đỏ rượu hoặc hồng burgundy':'mao lương san hô hoặc hồng đỏ';
    if(c.h<48)return c.l<40?'địa lan nâu hoặc lá đồng':'hồng Juliet hoặc mao lương đào';
    if(c.h<72)return 'lan vũ nữ hoặc mao lương vàng';
    if(c.h<165)return 'cẩm tú cầu xanh lá hoặc cúc xanh';
    if(c.h<255)return 'phi yến xanh hoặc cẩm tú cầu xanh lam';
    if(c.h<295)return 'cát tường tím hoặc phi yến tím';
    return c.l<44?'lan tím rượu hoặc cẩm chướng mận':'đậu thơm hồng tím hoặc hồng mauve';
  }
  const percent=c=>Math.round(100*c.weight/total);
  const colorText=colors.map(c=>`${c.hex} (${percent(c)}%)`).join(' · ');
  const ratioAdvice=base.l<25?'Nếu mảng tối đến từ phông, giữ sắc tối ở bình, lá hoặc hậu cảnh; dành mặt hoa cho sắc sáng hơn.':percent(base)>48?'Giữ một mảng nền liền, lặp màu phụ thành cụm nhỏ quanh hoa chính.':'Giữ các mảng màu thành cụm có diện tích khác nhau; đặt màu nhấn ở một điểm thay vì rải đều.';
  const shape=dm.shape||'Tự do';
  const form=/asym|bất đối/i.test(shape)?'Đặt khối đặc lùi về một bên, kéo một cành dẫn sang khoảng thoáng.':/cascade|rủ|thác/i.test(shape)?'Thu nhỏ dần mặt hoa dọc đoạn rủ để đuôi nhẹ và còn thấy đường cành.':/tròn|vòm|dome/i.test(shape)?'Xếp các mặt hoa theo cung vòm, thay đổi độ sâu để tránh thành một mặt phẳng.':/ngang|horizontal/i.test(shape)?'Kéo mảng hoa theo chiều ngang, để hai đầu thưa dần.':'Dựng đường bao trước, đặt cụm hoa chính ở nơi các hướng cành hội tụ.';
  const light=lightness<37?'Dùng sáng tản từ bên hông, hắt nhẹ phía tối để giữ chi tiết cánh sẫm.':lightness>69?'Dùng ánh sáng trắng qua màn tán; giữ đủ chi tiết ở mép cánh nhạt.':span>40?'Hắt sáng vào lớp sâu và kiểm tra mặt cánh sáng nhất trước khi chụp.':'Chiếu xiên nhẹ để bóng cánh tách các lớp hoa gần sắc độ.';
  const cards=[
    ['Tinh thần & Chủ đề',[dm.theme,mood,DM_FASHION_CUES[dm.fashion]].filter(Boolean).join(' · ')],
    ['Bảng màu & Tỉ lệ đề xuất',`${colorText}. ${ratioAdvice}`],
    ['Hình khối & Chất liệu',[shape,form,(dm.textures||[]).join(', '),DM_ARCH_CUES[dm.arch]].filter(Boolean).join(' · ')],
    ['Gợi ý Loài hoa & Ánh sáng',`Thử ${flowers(accent)} cho sắc ${accent.hex}. ${light} ${DM_ART_CUES[dm.art]||''}`]
  ];
  box.replaceChildren(...cards.map(([title,body])=>{
    const card=document.createElement('div');
    card.className='p-3 rounded-xl bg-[#F7F4EF] border border-[#E4DFD5] space-y-1';
    const heading=document.createElement('div');
    heading.className='font-semibold text-[#A65A42]';heading.textContent=title;
    const p=document.createElement('p');p.textContent=body;card.append(heading,p);return card;
  }));
}