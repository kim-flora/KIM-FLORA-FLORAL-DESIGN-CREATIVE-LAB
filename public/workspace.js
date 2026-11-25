const storageKey = 'kim-flora-lab-projects-v1';

export function setupWorkspace() {
  const get = id => document.getElementById(id);
  const form = get('project-form');
  const status = get('project-status');
  const list = get('project-list');
  const colors = get('project-colors');
  let projects = [];
  let selected = null;
  let dirty = false;
  let readable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(saved)) throw new Error();
    projects = saved;
  } catch {
    readable = false;
    status.textContent = 'Không đọc được dữ liệu trên thiết bị này.';
  }

  function persist(next, message) {
    try {
      if (!readable) throw new Error();
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      status.textContent = 'Chưa lưu được. Hãy giữ trang này mở để sao chép nội dung.';
      return false;
    }
    projects = next;
    status.textContent = message;
    return true;
  }

  function renderList() {
    list.replaceChildren();
    get('project-empty').hidden = projects.length > 0 || !readable;
    for (const project of projects) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = project.title;
      if (selected === project.id) button.setAttribute('aria-current', 'true');
      button.onclick = () => open(project);
      item.append(button);
      list.append(item);
    }
  }

  function addColor(value = '#637558') {
    const row = document.createElement('div');
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = value;
    swatch.setAttribute('aria-label', 'Chọn màu');
    const hex = document.createElement('output');
    hex.textContent = swatch.value.toUpperCase();
    swatch.oninput = () => { hex.textContent = swatch.value.toUpperCase(); };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Bỏ màu';
    remove.onclick = () => { row.remove(); dirty = true; };
    row.append(swatch, hex, remove);
    colors.append(row);
  }

  function open(project, force = false) {
    if (!force && dirty && !window.confirm('Bỏ thay đổi chưa lưu của dự án đang mở?')) return;
    selected = project?.id ?? null;
    dirty = false;
    form.hidden = false;
    status.textContent = '';
    for (const key of ['title', 'occasion', 'notes', 'materials']) {
      form.elements.namedItem(key).value = project?.[key] ?? '';
    }
    colors.replaceChildren();
    (project?.colors ?? []).forEach(addColor);
    get('delete-project').hidden = !selected;
    get('workspace-intro').hidden = true;
    renderList();
    form.elements.namedItem('title').focus();
  }

  get('new-project').onclick = () => open(null);
  get('add-color').onclick = () => { addColor(); dirty = true; };
  form.oninput = () => { dirty = true; };
  form.onsubmit = event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    fields.title = fields.title.trim();
    if (!fields.title) {
      status.textContent = 'Hãy nhập tên dự án.';
      form.elements.namedItem('title').focus();
      return;
    }
    const project = {
      ...fields, id: selected ?? crypto.randomUUID(),
      colors: Array.from(colors.querySelectorAll('input'), input => input.value)
    };
    const next = selected
      ? projects.map(item => item.id === selected ? project : item)
      : [project, ...projects];
    if (!persist(next, 'Đã lưu dự án trên thiết bị này.')) return;
    dirty = false;
    selected = project.id;
    get('delete-project').hidden = false;
    renderList();
  };
  get('delete-project').onclick = () => {
    if (!selected || !window.confirm('Xóa dự án này khỏi thiết bị?')) return;
    if (!persist(projects.filter(project => project.id !== selected), 'Đã xóa dự án.')) return;
    selected = null;
    dirty = false;
    form.hidden = true;
    get('workspace-intro').hidden = false;
    renderList();
    get('new-project').focus();
  };
  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  renderList();
}
