import { readPhotoPalettes } from './palette-library.js';

const list = document.getElementById('legacyPaletteList');
const status = document.getElementById('legacyPaletteStatus');

function readLocalPalettes() {
  const entries = JSON.parse(localStorage.getItem('kim-flora-color-formulas-v1') ?? '[]');
  if (!Array.isArray(entries)) throw new Error('Invalid saved palette list');
  return entries;
}

let request = 0;
async function renderLegacyPalettes() {
  const current = ++request;
  const results = await Promise.allSettled([Promise.resolve().then(readLocalPalettes), readPhotoPalettes()]);
  if (current !== request) return;
  list.replaceChildren();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const entry of result.value) {
      if (typeof entry?.id !== 'string' || typeof entry.name !== 'string') continue;
      const row = document.createElement('li');
      const details = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = entry.name;
      details.append(title);
      for (const value of [entry.occasion, entry.notes]) {
        if (typeof value !== 'string' || !value) continue;
        const text = document.createElement('p');
        text.className = 'whitespace-pre-wrap';
        text.textContent = value;
        details.append(text);
      }
      const colors = Array.isArray(entry.palette) ? entry.palette.filter(color =>
        /^#[\da-f]{6}$/i.test(color?.hex) && Number.isFinite(color.weight)
      ) : [];
      if (colors.length) {
        const swatches = document.createElement('p');
        swatches.textContent = colors.map(color => color.hex).join(' · ');
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'underline';
        open.textContent = 'Nạp lại';
        open.onclick = async () => {
          try {
            const image = entry.photo instanceof Blob ? await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(entry.photo);
            }) : null;
            window.dispatchEvent(new CustomEvent('studio:load-saved-palette', {detail:{palette:colors,image}}));
          } catch {
            status.textContent = 'Chưa đọc được ảnh của bảng màu.';
          }
        };
        details.append(swatches, open);
      }
      row.append(details);
      list.append(row);
    }
  }
  status.textContent = results.some(result => result.status === 'rejected')
    ? 'Chưa đọc được đầy đủ kho bảng màu cũ trên trình duyệt này.' : '';
}

window.addEventListener('pageshow', renderLegacyPalettes);
window.addEventListener('focus', renderLegacyPalettes);
renderLegacyPalettes();
