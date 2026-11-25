export function hexToHsl(hex) {
  const [r, g, b] = hex.match(/[\da-f]{2}/gi).map(pair => parseInt(pair, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  let sector = (r - g) / delta + 4;
  if (max === r) sector = (g - b) / delta;
  else if (max === g) sector = (b - r) / delta + 2;
  return {
    hue: (sector * 60 + 360) % 360,
    saturation: delta / (1 - Math.abs(2 * lightness - 1)),
    lightness
  };
}

function hslToHex(hue, saturation, lightness) {
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = offset => {
    const wave = (offset + hue / 30) % 12;
    const value = lightness - amplitude * Math.max(-1, Math.min(wave - 3, 9 - wave, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return ('#' + [0, 8, 4].map(channel).join('')).toUpperCase();
}

const offsets = {
  analogous: [0, 22, -22, 42, -42, 12],
  complementary: [0, 180, 15, 195, -12, 165],
  monochrome: [0, 0, 0, 0, 0, 0],
  triadic: [0, 120, 240, 0, 120, 240],
  split: [0, 150, 210, 14, 164, 226],
  tetradic: [0, 90, 180, 270, 12, 102]
};

export function defaultWeights(count) {
  if (count === 1) return [100];
  if (count === 2) return [60, 40];
  if (count === 3) return [60, 30, 10];
  if (count === 4) return [60, 30, 6, 4];
  if (count === 5) return [60, 30, 5, 3, 2];
  return [60, 30, 4, 3, 2, 1];
}

export function generatePalette(base, count, scheme) {
  const { hue, saturation, lightness } = hexToHsl(base);
  const steps = [0, .19, -.16, .32, -.29, .09];
  return defaultWeights(count).map((weight, index) => {
    const shifted = scheme === 'monochrome'
      ? .1 + .8 * ((lightness + [0, .28, .59, .82, .14, .42][index]) % 1)
      : Math.max(.12, Math.min(.88, lightness + steps[index]));
    const targetHue = (hue + offsets[scheme][index] + 360) % 360;
    const targetSaturation = saturation < .04 && scheme !== 'monochrome' ? .24 : saturation;
    return { hex: index ? hslToHex(targetHue, targetSaturation, shifted) : base, weight };
  });
}

export function allocate(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const normalized = weights.map(weight => sum ? weight / sum * total : total / weights.length);
  const counts = normalized.map(Math.floor);
  const priority = normalized.map((value, index) => ({ index, fraction: value - counts[index] }));
  priority.sort((a, b) => b.fraction - a.fraction);
  const remainder = total - counts.reduce((a, b) => a + b, 0);
  priority.slice(0, remainder).forEach(({ index }) => counts[index]++);
  return counts;
}

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map(pair => parseInt(pair, 16) / 255);
  const [r, g, b] = channels.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}

export function analyzePalette(palette) {
  const colors = palette.map(({ hex }) => {
    const hsl = hexToHsl(hex);
    const { hue, saturation } = hsl;
    const temperature = saturation < .08 ? 'Trung tính' : hue <= 70 || hue >= 330 ? 'Thiên ấm' : 'Thiên lạnh';
    return { hex, ...hsl, temperature };
  });
  const neutralLimit = .08;
  const hues = colors.filter(color => color.saturation >= neutralLimit).map(color => color.hue);
  const distances = hues.flatMap((hue, i) => hues.slice(i + 1).map(other => {
    const difference = Math.abs(hue - other);
    return Math.min(difference, 360 - difference);
  }));
  let harmony = 'Nhiều hướng sắc. Kiểm tra sắc nào đóng vai trò chủ đạo trên hoa thật.';
  if (!distances.length) harmony = 'Chủ yếu trung tính hoặc một hướng sắc.';
  else if (distances.every(distance => distance <= 55)) harmony = 'Các sắc gần nhau, thiên về hòa sắc tương đồng.';
  else if (distances.every(distance => distance <= 35 || distance >= 145)) harmony = 'Hai nhóm sắc đối nhau, thiên về hòa sắc bổ túc.';
  else if (distances.every(distance => distance <= 30 || Math.abs(distance - 120) <= 25)) harmony = 'Các nhóm sắc gần cấu trúc bộ ba.';
  const luminances = colors.map(({ hex }) => luminance(hex));
  const contrast = (Math.max(...luminances) + .05) / (Math.min(...luminances) + .05);
  return { colors, harmony, contrast };
}

export function generateVariation(base, count, scheme, current, random = Math.random) {
  const locked = current.map((item, index) => ({ item, index })).filter(({ item }) => item.locked);
  if (locked.length > count) return null;
  const slots = Array(count).fill(null);
  for (const { item, index } of locked.filter(({ index }) => index < count)) slots[index] = item;
  for (const { item } of locked.filter(({ index }) => index >= count)) slots[slots.indexOf(null)] = item;

  const candidates = generatePalette(base, count, scheme);
  return candidates.map((item, index) => {
    if (slots[index]) return { ...slots[index] };
    const weight = current.length === count ? current[index].weight : item.weight;
    if (!index) return { ...item, weight };
    const { hue, saturation, lightness } = hexToHsl(item.hex);
    const shade = Math.max(.10, Math.min(.90, lightness + (random() - .5) * .24));
    const chroma = Math.max(0, Math.min(.95, saturation * (.75 + random() * .45)));
    return { hex: hslToHex(hue, chroma, shade), weight };
  });
}

export function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}

export function extractPalette(pixels, count, width = pixels.length / 4) {
  const samples = [];
  const stride = Math.max(1, Math.floor(pixels.length / (4 * 4800)));
  const height = pixels.length / (4 * width);
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    if (pixels[i + 3] < 128) continue;
    const index = i / 4;
    samples.push({
      rgb: [pixels[i], pixels[i + 1], pixels[i + 2]],
      x: (index % width + .5) / width,
      y: (Math.floor(index / width) + .5) / height
    });
  }
  if (!samples.length) return [];
  const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centers = [samples[Math.floor(samples.length / 2)].rgb];
  while (centers.length < count) {
    let farthest;
    let best = 0;
    for (const { rgb } of samples) {
      const nearest = Math.min(...centers.map(center => distance(rgb, center)));
      if (nearest > best) { best = nearest; farthest = rgb; }
    }
    if (!farthest) break;
    centers.push(farthest);
  }
  let groups;
  for (let round = 0; round < 12; round++) {
    groups = centers.map(() => []);
    for (const sample of samples) {
      let closest = 0;
      let best = Infinity;
      centers.forEach((center, i) => {
        const d = distance(sample.rgb, center);
        if (d < best) { best = d; closest = i; }
      });
      groups[closest].push(sample);
    }
    for (const [index, group] of groups.entries()) {
      if (!group.length) continue;
      const sums = [0, 0, 0];
      for (const { rgb } of group) rgb.forEach((value, channel) => { sums[channel] += value; });
      centers[index] = sums.map(sum => sum / group.length);
    }
  }
  return groups.flatMap((group, index) => {
    if (!group.length) return [];
    const center = centers[index];
    const nearest = group.reduce((a, b) => distance(b.rgb, center) < distance(a.rgb, center) ? b : a);
    const hex = '#' + nearest.rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    return [{ hex, weight: group.length, point: { x: nearest.x, y: nearest.y } }];
  }).sort((a, b) => b.weight - a.weight);
}
