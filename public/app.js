import { setupColorStudio } from './color-studio.js';
import { setupWorkspace } from './workspace.js';

const login = document.querySelector('#login');
const change = document.querySelector('#change');
const account = document.querySelector('#account');
const accessLayout = document.querySelector('#access-layout');
const settings = document.querySelector('#settings');
const title = document.querySelector('#screen-title');
const notice = document.querySelector('#message');
const settingsDialog = document.getElementById('settings-dialog');
const settingsTitle = document.getElementById('settings-title');
const settingsNotice = document.getElementById('settings-message');
let busy = false;
setupWorkspace();
const focusWorkspace = setupColorStudio();

function message(value, isError = false) {
  const target = settingsDialog.open ? settingsNotice : notice;
  target.classList.toggle('error', isError);
  target.textContent = value;
}

function togglePassword(button, visible) {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  input.type = visible ? 'text' : 'password';
  button.textContent = visible ? 'Ẩn' : 'Hiện';
  const label = input.labels[0].textContent.toLowerCase();
  button.setAttribute('aria-label', (visible ? 'Ẩn ' : 'Hiện ') + label);
}

function screen(name, focus = true) {
  for (const form of [login, change]) {
    form.reset();
    form.querySelectorAll('.visibility').forEach(button => togglePassword(button, false));
  }
  const insideWorkspace = name !== 'login';
  const configuring = name === 'settings' || name === 'change';
  account.hidden = !insideWorkspace;
  accessLayout.hidden = insideWorkspace;
  settings.hidden = name !== 'settings';
  change.hidden = name !== 'change';
  if (configuring) {
    settingsTitle.textContent = name === 'change' ? 'Đổi mật khẩu' : 'Cài đặt cá nhân';
    if (!settingsDialog.open) settingsDialog.showModal();
  } else if (settingsDialog.open) {
    settingsDialog.close();
  }
  message('');
  if (insideWorkspace && !configuring) focusWorkspace(focus);
  else if (focus) (configuring ? settingsTitle : title).focus();
}

async function request(body) {
  const options = body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : {};
  const response = await fetch('/api/auth', options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Hệ thống tạm thời không kết nối được. Vui lòng thử lại.'); }
  if (!response.ok) {
    const error = new Error(data.message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showState(data, focus = true) {
  screen(data.signedIn ? 'account' : 'login', focus);
  if (data.message) message(data.message);
}

async function submit(button, body) {
  if (busy) return;
  busy = true;
  button.disabled = true;
  message('');
  try {
    showState(await request(body));
  } catch (error) {
    if ((error.status === 401 || error.status === 409) && body.action === 'change') screen('login');
    message(error.message, true);
  } finally {
    button.disabled = false;
    busy = false;
  }
}

for (const [form, action] of [[login, 'login'], [change, 'change']]) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    submit(event.submitter || form.querySelector('[type=submit]'), {
      ...Object.fromEntries(new FormData(form)),
      action
    });
  });
}
document.querySelectorAll('.visibility').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    togglePassword(button, input.type === 'password');
  });
});
document.querySelectorAll('.logout').forEach(button => {
  button.addEventListener('click', () => submit(button, { action: 'logout' }));
});
for (const [id, destination] of [
  ['open-settings', 'settings'],
  ['close-settings', 'account'],
  ['open-change', 'change'],
  ['cancel', 'settings']
]) {
  document.getElementById(id).addEventListener('click', () => {
    if (!busy) screen(destination);
  });
}

settingsDialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (!busy) screen('account');
});

request().then(data => {
  if (!busy && data.signedIn) showState(data, false);
}).catch(error => { if (!busy) message(error.message, true); });
