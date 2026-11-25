import { allocate, analyzePalette, defaultWeights, generatePalette } from './color-model.js';

const storageKey = 'kim-flora-color-formulas-v1';
const normalizeHex = value => '#' + value.trim().replace(/^#/, '').toUpperCase();

export function setupColorStudio() {
  const get = id => document.getElementById(id);
  const studio = get('color-studio');
  const projectView = get('project-view');
  const studioButton = get('show-color-studio');
  const projectButton = get('show-projects');
  const base = get('studio-base');
  const hex = get('studio-hex');
  const name = get('formula-name');
  const list = get('formula-list');
  const status = get('studio-status');
  const swatches = get('studio-swatches');
  let palette = generatePalette('#9A5064', 3, 'analogous');

  function focusView() {
    get(studio.hidden ? 'workspace-title' : 'studio-title').focus();
  }

  function navigate(openStudio) {
    studio.hidden = !openStudio;
    projectView.hidden = openStudio;
    (openStudio ? projectButton : studioButton).removeAttribute('aria-current');
    (openStudio ? studioButton : projectButton).setAttribute('aria-current', 'page');
    focusView();
  }
  studioButton.onclick = () => navigate(true);
  projectButton.onclick = () => navigate(false);

  function updateAnalysis() {
    const weights = palette.map(item => item.weight);
    const percentages = allocate(weights, 100);
    const roles = palette.length === 2 ? [percentages[0], percentages[1]] :
      [percentages[0], percentages[1], percentages.slice(2).reduce((sum, value) => sum + value, 0)];
    const ratio = roles.join(' – ');
    get('studio-ratio').textContent = 'Tỷ lệ chính · phụ' +
      (roles.length === 3 ? ' · nhấn' : '') + ' ' + ratio + '%';
    const { colors, contrast, harmony } = analyzePalette(palette);
    const rows = colors.map((color, index) => {
      const row = document.createElement('tr');
      for (const value of [color.hex + ' · ' + percentages[index] + '%', color.temperature,
        Math.round(color.lightness * 100) + '%', Math.round(color.saturation * 100) + '%']) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    get('studio-analysis').replaceChildren(...rows);
    get('studio-contrast').textContent = 'Tương phản sáng tối giữa cặp xa nhất ' + contrast.toFixed(2) + ':1.';
    get('studio-harmony').textContent = 'Hòa sắc theo vòng màu. ' + harmony;
    drawBouquet(palette);
  }

  function render() {
    swatches.replaceChildren(...palette.map((item, index) => {
      const tile = document.createElement('div');
      const color = document.createElement('input');
      color.type = 'color';
      color.value = item.hex;
      color.setAttribute('aria-label', 'Màu ' + (index + 1));
      const code = document.createElement('input');
      code.type = 'text';
      code.value = item.hex;
      code.pattern = '#?[0-9A-Fa-f]{6}';
      code.maxLength = 7;
      code.setAttribute('aria-label', 'Mã HEX màu ' + (index + 1));
      code.onchange = () => {
        if (/^#?[\da-f]{6}$/i.test(code.value.trim())) {
          item.hex = normalizeHex(code.value);
          color.value = item.hex;
          updateAnalysis();
          status.textContent = '';
        } else {
          status.textContent = 'Mã HEX cần có 6 ký tự, ví dụ #9A5064.';
        }
        code.value = item.hex;
      };
      color.oninput = () => {
        item.hex = normalizeHex(color.value);
        code.value = item.hex;
        updateAnalysis();
      };
      const label = document.createElement('label');
      label.textContent = 'Phần tỷ lệ';
      const weight = document.createElement('input');
      weight.type = 'number';
      weight.min = '0';
      weight.max = '100';
      weight.value = item.weight;
      weight.oninput = () => {
        item.weight = Math.max(0, Math.min(100, Number(weight.value) || 0));
        updateAnalysis();
      };
      weight.onchange = () => { weight.value = item.weight; };
      label.append(weight);
      tile.append(color, code, label);
      return tile;
    }));
    get('reset-ratio').textContent = palette.length === 2 ? 'Áp dụng 60–40' : 'Áp dụng 60–30–10';
    updateAnalysis();
  }

  base.oninput = () => { hex.value = normalizeHex(base.value); };
  hex.oninput = () => { if (hex.validity.valid) base.value = normalizeHex(hex.value); };
  get('generate-palette').onsubmit = event => {
    event.preventDefault();
    const color = normalizeHex(hex.value);
    palette = generatePalette(color, Number(get('studio-count').value), get('studio-scheme').value);
    status.textContent = '';
    render();
  };
  get('reset-ratio').onclick = () => {
    const weights = defaultWeights(palette.length);
    palette.forEach((item, index) => { item.weight = weights[index]; });
    render();
  };

  function readFormulas() {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(saved)) throw new Error();
    return saved;
  }

  function updateList(formulas, selected = '') {
    list.replaceChildren(new Option('Chọn công thức', ''));
    for (const item of formulas) list.add(new Option(item.name, item.id));
    list.value = selected;
    get('open-formula').disabled = !list.value;
  }

  list.onchange = () => { get('open-formula').disabled = !list.value; };
  try { updateList(readFormulas()); }
  catch { status.textContent = 'Chưa đọc được công thức trên trình duyệt này.'; }

  get('save-formula').onsubmit = event => {
    event.preventDefault();
    const formulaName = name.value.trim();
    if (!formulaName) {
      status.textContent = 'Hãy nhập tên công thức.';
      return;
    }
    try {
      const formulas = readFormulas();
      const entry = { id: crypto.randomUUID(), name: formulaName, palette };
      formulas.unshift(entry);
      localStorage.setItem(storageKey, JSON.stringify(formulas));
      updateList(formulas, entry.id);
      status.textContent = 'Đã lưu công thức trên trình duyệt này.';
    } catch {
      status.textContent = 'Chưa lưu được. Chị có thể xuất hồ sơ màu để giữ công thức.';
    }
  };

  get('open-formula').onclick = () => {
    try {
      const entry = readFormulas().find(item => item.id === list.value);
      if (!entry) throw new Error();
      palette = entry.palette;
      name.value = entry.name;
      hex.value = base.value = palette[0].hex;
      get('studio-count').value = String(palette.length);
      render();
      status.textContent = 'Đã mở ' + entry.name + '.';
    } catch {
      status.textContent = 'Chưa mở được công thức.';
    }
  };

  get('export-formula').onclick = () => {
    const analysis = analyzePalette(palette);
    const percentages = allocate(palette.map(item => item.weight), 100);
    const rows = analysis.colors.map((item, index) => [
      item.hex, percentages[index] + '%', item.temperature, Math.round(item.lightness * 100) + '%',
      Math.round(item.saturation * 100) + '%'
    ].join(','));
    const title = (name.value.trim() || 'Bảng màu Kim Flora').replace(/"/g, '""');
    const safeTitle = /^[=+\-@]/.test(title) ? "'" + title : title;
    const csv = '\uFEFF"Công thức","' + safeTitle + '"\r\n' +
      'HEX,Tỷ lệ,Nhiệt độ,Độ sáng HSL,Độ bão hòa HSL\r\n' + rows.join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kim-flora-ho-so-mau.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  render();
  return focusView;
}

function drawBouquet(palette) {
  const bouquet = document.getElementById('studio-bouquet');
  const counts = allocate(palette.map(item => item.weight), 100);
  const flowers = palette.flatMap(({ hex }, index) =>
    Array.from({ length: counts[index] }, () => hex));
  bouquet.replaceChildren(...flowers.map((color, index) => {
    const position = (index * 37) % flowers.length;
    const radius = Math.sqrt((position + .5) / flowers.length);
    const angle = position * 2.399963;
    const bloom = document.createElement('span');
    bloom.style.left = 50 + Math.cos(angle) * radius * 43 + '%';
    bloom.style.top = 42 + Math.sin(angle) * radius * 35 + '%';
    bloom.style.backgroundColor = color;
    bloom.style.zIndex = String(position + 1);
    return bloom;
  }));
}
