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
      const link = document.createElement('a');
      link.className = 'underline';
      link.textContent = entry.name;
      link.href = '/workspace.html?palette=' + encodeURIComponent(entry.id) + '#color-studio';
      row.append(link);
      list.append(row);
    }
  }
  status.textContent = results.some(result => result.status === 'rejected')
    ? 'Chưa đọc được đầy đủ kho bảng màu cũ trên trình duyệt này.' : '';
}

window.addEventListener('pageshow', renderLegacyPalettes);
window.addEventListener('focus', renderLegacyPalettes);
renderLegacyPalettes();
