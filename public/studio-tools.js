const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16));

export function colorChannels(hex) {
  const channels = rgb(hex);
  const black = 1 - Math.max(...channels) / 255;
  const cmy = channels.map(value => black === 1 ? 0 : 1 - value / (255 * (1 - black)));
  return { rgb: channels.join(', '), cmyk: [...cmy, black].map(value => Math.round(value * 100)).join(', ') };
}

function lab(hex) {
  const [r, g, b] = rgb(hex).map(value => {
    const srgb = value / 255;
    return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
  });
  const [x, y, z] = [
    (.4124564 * r + .3575761 * g + .1804375 * b) / .95047,
    .2126729 * r + .7151522 * g + .0721750 * b,
    (.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883
  ].map(value => value > (6 / 29) ** 3 ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a, b) {
  const second = lab(b);
  return Math.hypot(...lab(a).map((value, index) => value - second[index]));
}

export function paintFloral(canvas, palette, type) {
  const ctx = canvas.getContext('2d');
  const [main, foliage = main, accent = main, vessel = foliage, ribbon = accent] = palette.map(item => item.hex);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  function ellipse(x, y, width, height, shade, angle = 0) {
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, angle, 0, 2 * Math.PI);
    ctx.fill();
  }
  function polygon(points, shade) {
    ctx.fillStyle = shade;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }
  let centers = [[146,132], [198,101], [260,106], [309,142], [218,152], [269,175], [170,177]];
  if (type === 'arch') {
    ctx.strokeStyle = vessel;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(94, 310);
    ctx.lineTo(94, 156);
    ctx.arc(230, 156, 136, Math.PI, Math.PI * 2);
    ctx.lineTo(366, 310);
    ctx.stroke();
    centers = [[95,210], [96,153], [111,99], [146,58], [195,35], [253,27], [365,230]];
  } else if (type === 'vase') {
    polygon([[182,170],[278,170],[312,265],[276,309],[184,309],[148,265]], vessel);
  } else if (type === 'hatbox') {
    ctx.fillStyle = vessel;
    ctx.fillRect(135, 187, 190, 110);
    ellipse(230, 297, 95, 19, vessel);
    ellipse(230, 196, 100, 23, ribbon);
  } else {
    polygon([[104,155],[226,315],[347,151],[239,206]], vessel);
    polygon([[204,252],[262,252],[244,270],[214,270]], ribbon);
  }
  centers.forEach(([x, y], index) => {
    ellipse(x - 19, y - 19, 31, 10, foliage, index % 2 ? -.5 : .45);
    const bloom = index === 1 || index === 6 ? accent : main;
    for (let petal = 0; petal < 6; petal++) {
      const angle = petal * Math.PI / 3;
      ellipse(x + Math.cos(angle) * 15, y + Math.sin(angle) * 15, 16, 11, bloom, angle);
    }
    ellipse(x, y, 5, 5, ribbon);
  });
}
