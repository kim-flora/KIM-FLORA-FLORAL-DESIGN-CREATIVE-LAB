const login = document.querySelector('#login');
const change = document.querySelector('#change');
const account = document.querySelector('#account');
const settings = document.querySelector('#settings');
const title = document.querySelector('#screen-title');
const intro = document.querySelector('#intro');
const notice = document.querySelector('#message');
let busy = false;

function message(value, isError = false) {
  notice.classList.toggle('error', isError);
  notice.textContent = value;
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
  login.hidden = name !== 'login';
  change.hidden = name !== 'change';
  account.hidden = name !== 'account';
  settings.hidden = name !== 'settings';
  const copy = {
    login: ['Đăng nhập', 'Nhập mật khẩu riêng của Kim Flora để vào Creative Lab.'],
    account: ['Tài khoản Kim Flora', 'Bạn đã đăng nhập vào Creative Lab.'],
    settings: ['Cài đặt cá nhân', 'Quản lý mật khẩu tài khoản Kim Flora.'],
    change: ['Đổi mật khẩu', 'Nhập mật khẩu hiện tại và xác nhận mật khẩu mới.']
  };
  [title.textContent, intro.textContent] = copy[name];
  message('');
  if (focus) title.focus();
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

request().then(data => {
  if (!busy && data.signedIn) showState(data, false);
}).catch(error => { if (!busy) message(error.message, true); });
