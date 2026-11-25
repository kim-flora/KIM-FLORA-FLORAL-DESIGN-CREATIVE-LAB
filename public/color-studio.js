import { allocate, analyzePalette, defaultWeights, generatePalette, generateVariation, contrastRatio, extractPalette } from './color-model.js';

import { readPhotoPalettes, savePhotoPalette } from './palette-library.js';

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

  let sourcePhoto = null;
  let photoUrl;
  let photoFormulaId = null;
  let saving = false;
  const history = [];

  function showPhoto() {
    const image = get('palette-photo');
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = sourcePhoto ? URL.createObjectURL(sourcePhoto) : null;
    if (photoUrl) image.src = photoUrl;
    else image.removeAttribute('src');
    get('palette-source').hidden = !photoUrl;
    get('palette-photo-name').textContent = sourcePhoto?.name ?? '';
  }

  const future = [];
  const count = get('studio-count');
  const paletteStatus = get('palette-status');
  const foreground = get('contrast-foreground');
  const background = get('contrast-background');

  function updateContrast() {
    const ratio = contrastRatio(palette[Number(foreground.value)].hex, palette[Number(background.value)].hex);
    get('contrast-result').textContent = ratio.toFixed(2) +
      ' : 1 · ' + (ratio >= 7 ? 'AAA cho chữ thường' : ratio >= 4.5 ? 'AA cho chữ thường' :
        ratio >= 3 ? 'AA cho chữ lớn' : 'Chưa đạt AA cho chữ lớn');
  }

  foreground.onchange = background.onchange = updateContrast;

  function replaceColors(colors) {
    if (palette.some(item => item.locked)) {
      paletteStatus.textContent = 'Bỏ khóa các màu hiện tại để thay toàn bộ bảng phối.';
      return;
    }
    remember();
    sourcePhoto = null;
    photoFormulaId = null;
    name.value = '';
    showPhoto();
    palette = colors.map((hex, index) => ({ hex, weight: defaultWeights(colors.length)[index] }));
    count.value = String(colors.length);
    render();
    paletteStatus.textContent = 'Đã nạp bảng màu.';
  }

  get('palette-preset').onchange = event => {
    const select = event.currentTarget;
    if (select.value) replaceColors(select.value.split(','));
    select.value = '';
  };

  get('palette-image').onchange = async event => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file || saving) {
      input.value = '';
      return;
    }
    input.disabled = true;
    saving = true;
    paletteStatus.textContent = 'Đang phân tích ảnh…';
    const colorCount = Number(count.value);
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 240 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      try { context.drawImage(image, 0, 0, canvas.width, canvas.height); }
      finally { image.close(); }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const samples = extractPalette(pixels, colorCount);
      if (!samples.length) {
        paletteStatus.textContent = 'Ảnh không có vùng màu đủ rõ để phân tích.';
        return;
      }
      const percentages = allocate(samples.map(item => item.weight), 100);
      remember();
      palette = samples.map((item, index) => ({ hex: item.hex, weight: percentages[index] }));
      sourcePhoto = file;
      photoFormulaId = crypto.randomUUID();
      name.value = file.name.replace(/\.[^.]+$/, '').slice(0, 120).trim() || 'Bảng màu từ ảnh';
      count.value = String(palette.length);
      hex.value = base.value = palette[0].hex;
      showPhoto();
      render();
      paletteStatus.textContent = await saveCurrentPhoto()
        ? 'Đã phân tích và lưu ảnh gốc cùng bảng màu trên thiết bị này.'
        : 'Đã phân tích ảnh. Chưa lưu được ảnh và bảng màu. Hãy thử nút Lưu công thức.';
    } catch {
      paletteStatus.textContent = 'Chưa đọc được ảnh. Hãy thử tệp JPG, PNG hoặc WebP.';
    } finally {
      saving = false;
      input.disabled = false;
      input.value = '';
    }
  };

  get('palette-png').onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    const proportions = allocate(palette.map(item => item.weight), 100);
    const widths = allocate(palette.map(item => item.weight), canvas.width);
    context.fillStyle = '#F4F0E7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#29342A';
    context.font = '25px system-ui';
    context.fillText('KIM FLORA  /  FLORAL COLOR STUDIO', 32, 52);
    let left = 32;
    const column = (canvas.width - 64) / palette.length;
    palette.forEach(({ hex }, index) => {
      const x = 32 + column * index;
      context.fillStyle = hex;
      context.fillRect(x, 82, column, 260);
      context.fillStyle = '#29342A';
      context.font = '20px monospace';
      context.fillText(hex, x + 8, 377);
      context.fillText(proportions[index] + '%', x + 8, 405);
      context.fillStyle = hex;
      context.fillRect(left, 434, widths[index] * (1016 / 1080), 14);
      left += widths[index] * (1016 / 1080);
    });
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'kim-flora-bang-mau.png';
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  function snapshot() {
    return { palette: palette.map(item => ({ ...item })), sourcePhoto, photoFormulaId, title: name.value };
  }

  function updateHistory() {
    get('undo-palette').disabled = !history.length;
    get('redo-palette').disabled = !future.length;
  }

  function remember() {
    history.push(snapshot());
    if (history.length > 60) history.shift();
    future.length = 0;
    updateHistory();
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const previous = from.pop();
    ({ palette, sourcePhoto, photoFormulaId } = previous);
    name.value = previous.title;
    showPhoto();
    hex.value = base.value = palette[0].hex;
    count.value = String(palette.length);
    paletteStatus.textContent = '';
    render();
  }

  get('undo-palette').onclick = () => restore(history, future);
  get('redo-palette').onclick = () => restore(future, history);
  get('copy-palette').onclick = async () => {
    const codes = palette.map(item => item.hex).join(', ');
    try {
      await navigator.clipboard.writeText(codes);
      paletteStatus.textContent = 'Đã sao chép mã HEX.';
    } catch {
      paletteStatus.textContent = codes;
    }
  };

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
    for (const [select, fallback] of [[foreground, 0], [background, 1]]) {
      const previous = select.value;
      select.replaceChildren(...palette.map((item, index) => new Option(item.hex, String(index))));
      select.value = previous !== '' && Number(previous) < palette.length ? previous : String(Math.min(fallback, palette.length - 1));
    }
    updateContrast();
    const weights = palette.map(item => item.weight);
    const percentages = allocate(weights, 100);
    const roles = palette.length < 3 ? percentages :
      [percentages[0], percentages[1], percentages.slice(2).reduce((sum, value) => sum + value, 0)];
    const ratio = roles.map(value => value + '%').join(' · ');
    get('studio-ratio').textContent = (roles.length === 1 ? 'Tỷ lệ màu chính' : 'Tỷ lệ chính · phụ') +
      (roles.length === 3 ? ' · nhấn' : '') + ' ' + ratio;
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
    get('studio-ratio-bar').replaceChildren(...palette.flatMap(({ hex }, index) => {
      if (!percentages[index]) return [];
      const segment = document.createElement('span');
      segment.style.width = percentages[index] + '%';
      segment.style.backgroundColor = hex;
      segment.title = hex + ' · ' + percentages[index] + '%';
      return [segment];
    }));
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
          if (item.hex !== normalizeHex(code.value)) remember();
          item.hex = normalizeHex(code.value);
          color.value = item.hex;
          updateAnalysis();
          status.textContent = '';
        } else {
          status.textContent = 'Mã HEX cần có 6 ký tự, ví dụ #9A5064.';
        }
        code.value = item.hex;
      };
      color.onchange = () => {
        if (item.hex !== normalizeHex(color.value)) remember();
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
      let weightEditing = false;
      weight.oninput = () => {
        if (!weightEditing) remember();
        weightEditing = true;
        item.weight = Math.max(0, Math.min(100, Number(weight.value) || 0));
        updateAnalysis();
      };
      weight.onblur = () => {
        weightEditing = false;
        weight.value = item.weight;
      };
      label.append(weight);
      const role = document.createElement('strong');
      role.className = 'swatch-role';
      role.textContent = ['Chủ đạo', 'Hỗ trợ'][index] ?? 'Điểm nhấn';
      const controls = document.createElement('div');
      controls.className = 'swatch-actions';
      function button(label, handler) {
        const control = document.createElement('button');
        control.className = 'secondary';
        control.type = 'button';
        control.textContent = label;
        control.onclick = handler;
        controls.append(control);
        return control;
      }
      const lock = button(item.locked ? 'Bỏ khóa' : 'Khóa', () => {
        remember();
        item.locked = !item.locked;
        lock.textContent = item.locked ? 'Bỏ khóa' : 'Khóa';
        lock.setAttribute('aria-label', lock.textContent + ' màu ' + (index + 1));
        lock.setAttribute('aria-pressed', String(Boolean(item.locked)));
      });
      lock.setAttribute('aria-label', lock.textContent + ' màu ' + (index + 1));
      lock.setAttribute('aria-pressed', String(Boolean(item.locked)));
      for (const [symbol, step, direction] of [['←', -1, 'trước'], ['→', 1, 'sau']]) {
        const target = index + step;
        const move = button(symbol, () => {
          remember();
          [palette[index], palette[target]] = [palette[target], palette[index]];
          render();
          swatches.children[target].querySelector('input[type=text]').focus();
        });
        move.disabled = target < 0 || target >= palette.length;
        move.setAttribute('aria-label', 'Chuyển màu ' + (index + 1) + ' về ' + direction);
      }
      tile.append(role, color, code, controls, label);
      return tile;
    }));
    get('reset-ratio').hidden = palette.length === 1;
    get('reset-ratio').textContent = palette.length === 2 ? 'Áp dụng 60–40' : 'Áp dụng 60–30–10';
    updateAnalysis();
    updateHistory();
  }

  base.oninput = () => { hex.value = normalizeHex(base.value); };
  hex.oninput = () => { if (hex.validity.valid) base.value = normalizeHex(hex.value); };
  get('generate-palette').onsubmit = event => {
    event.preventDefault();
    const color = normalizeHex(hex.value);
    const next = generateVariation(color, Number(count.value), get('studio-scheme').value, palette);
    if (!next) {
      paletteStatus.textContent = 'Hãy bỏ khóa bớt màu trước khi giảm số màu.';
      return;
    }
    if (next.length === palette.length && next.every((item, i) => item.hex === palette[i].hex)) {
      paletteStatus.textContent = 'Hãy mở khóa ít nhất một ô màu ngoài màu gốc để tạo biến thể.';
      return;
    }
    remember();
    palette = next;
    paletteStatus.textContent = 'Đã tạo biến thể. Các màu khóa được giữ lại.';
    render();
  };
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        studio.closest('[hidden]') || document.querySelector('dialog[open]') ||
        event.target.closest('input, select, textarea, button, a, [contenteditable]')) return;
    event.preventDefault();
    get('generate-palette').requestSubmit();
  });
  get('reset-ratio').onclick = () => {
    remember();
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
  async function allFormulas() {
    const [local, photos] = await Promise.allSettled([
      Promise.resolve().then(readFormulas),
      readPhotoPalettes()
    ]);
    if (local.status === 'rejected' && photos.status === 'rejected') throw new Error();
    return [...(photos.value ?? []).sort((a, b) => b.updatedAt - a.updatedAt), ...(local.value ?? [])];
  }

  async function saveCurrentPhoto() {
    const entry = {
      id: photoFormulaId, name: name.value.trim(), palette: snapshot().palette,
      photo: sourcePhoto, updatedAt: Date.now()
    };
    try { await savePhotoPalette(entry); }
    catch { return false; }
    updateList(await allFormulas(), entry.id);
    return true;
  }

  allFormulas().then(entries => { if (!list.value) updateList(entries); })
    .catch(() => { status.textContent = 'Chưa đọc được công thức trên trình duyệt này.'; });

  get('save-formula').onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const formulaName = name.value.trim();
    if (!formulaName) {
      status.textContent = 'Hãy nhập tên công thức.';
      return;
    }
    if (sourcePhoto) {
      saving = true;
      try {
        status.textContent = await saveCurrentPhoto()
          ? 'Đã lưu ảnh và bảng màu trên thiết bị này.' : 'Chưa lưu được ảnh và bảng màu.';
      } finally { saving = false; }
      return;
    }
    try {
      const formulas = readFormulas();
      const entry = { id: crypto.randomUUID(), name: formulaName, palette };
      formulas.unshift(entry);
      localStorage.setItem(storageKey, JSON.stringify(formulas));
      updateList(await allFormulas(), entry.id);
      status.textContent = 'Đã lưu công thức trên trình duyệt này.';
    } catch {
      status.textContent = 'Chưa lưu được. Chị có thể xuất hồ sơ màu để giữ công thức.';
    }
  };

  get('open-formula').onclick = async () => {
    if (saving) return;
    const id = list.value;
    try {
      const entry = (await allFormulas()).find(item => item.id === id);
      if (!entry) throw new Error();
      if (!Array.isArray(entry.palette) || entry.palette.length < 1 || entry.palette.length > 6 ||
          !entry.palette.every(item => item && /^#[\da-f]{6}$/i.test(item.hex) && Number.isFinite(item.weight))) {
        throw new Error();
      }
      remember();
      palette = entry.palette;
      sourcePhoto = entry.photo ?? null;
      photoFormulaId = sourcePhoto ? entry.id : null;
      showPhoto();
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
