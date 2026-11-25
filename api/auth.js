import { createHmac, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const duration = 8 * 60 * 60;
const cookie = '__Host-kim-flora-lab';
const table = 'kim_flora_lab_access';
const key = process.env.LAB_GATEWAY;
const passwordOptions = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };

function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function passwordHash(password, salt = randomBytes(24).toString('hex')) {
  const hash = await scrypt(password, salt, 64, passwordOptions);
  return salt + '.' + hash.toString('hex');
}

function sign(data) {
  return createHmac('sha256', key).update('kim-flora/session/' + data).digest('base64url');
}

function setSession(res, version) {
  const value = version ? [version, Math.floor(Date.now() / 1000) + duration, randomBytes(24).toString('base64url')].join('.') : '';
  res.setHeader('Set-Cookie', cookie + '=' + (value ? value + '.' + sign(value) : '') +
    '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + (value ? duration : 0));
}

function sessionVersion(req) {
  const entry = (req.headers.cookie || '').split(/;\s*/).find(item => item.startsWith(cookie + '='));
  const parts = entry?.slice(cookie.length + 1).split('.');
  if (!parts || parts.length !== 4) return null;
  const [version, expiry, nonce, signature] = parts;
  if (!/^\d+$/.test(version) || !/^\d+$/.test(expiry) || !/^[\w-]{32}$/.test(nonce) ||
      Number(expiry) <= Date.now() / 1000 || !equal(sign([version, expiry, nonce].join('.')), signature)) return null;
  return Number(version);
}

async function database(path, method = 'GET', body) {
  const result = await fetch(process.env.LAB_DB_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: process.env.LAB_DB_KEY,
      'x-lab-gateway': key,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!result.ok) throw new Error('Database request failed');
  return result.json();
}

export async function hasStudioSession(req) {
  const version=sessionVersion(req);
  if(!version)return false;
  const [row]=await database(table+'?select=version&id=eq.1');
  return row?.version===version;
}

function validInput(password) {
  return typeof password === 'string' && password.length > 0 && password.length <= 128;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const error = (status, message) => res.status(status).json({ message });
  try {
    if (!key || !process.env.LAB_DB_URL || !process.env.LAB_DB_KEY) throw new Error('Missing configuration');
    const version = sessionVersion(req);

    if (req.method === 'GET') {
      if (!version) return res.json({ signedIn: false });
      const [row] = await database(table + '?select=version,must_rotate&id=eq.1');
      return res.json({ signedIn: row?.version === version, mustRotate: row?.must_rotate === true });
    }

    if (req.method !== 'POST') return error(405, 'Phương thức không được hỗ trợ.');
    const host = req.headers.host;
    if (!host || req.headers.origin !== 'https://' + host ||
        req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return error(403, 'Yêu cầu không hợp lệ.');
    }

    const { action, password, nextPassword, confirmation } = req.body || {};
    if (action === 'logout') {
      setSession(res, null);
      return res.json({ signedIn: false });
    }

    if (action !== 'login' && action !== 'change') return error(400, 'Yêu cầu không hợp lệ.');
    if (!validInput(password)) return error(400, 'Vui lòng nhập mật khẩu (tối đa 128 ký tự).');
    if (action === 'change') {
      if (!version) return error(401, 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
      if (!validInput(nextPassword) || nextPassword.length < 12) {
        return error(400, 'Mật khẩu mới phải có từ 12 đến 128 ký tự.');
      }
      if (nextPassword !== confirmation) return error(400, 'Xác nhận mật khẩu mới chưa khớp.');
      if (password === nextPassword) return error(400, 'Hãy dùng mật khẩu khác mật khẩu hiện tại.');
    }

    const [row] = await database('rpc/kim_flora_lab_attempt', 'POST', {});
    if (!row) return error(429, 'Có quá nhiều lần thử. Vui lòng chờ một phút rồi thử lại.');
    if (action === 'change' && row.version !== version) {
      return error(401, 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const expected = await passwordHash(password, row.password_hash.split('.')[0]);
    if (!equal(expected, row.password_hash)) {
      return error(action === 'login' ? 401 : 400,
        action === 'login' ? 'Mật khẩu chưa đúng. Vui lòng thử lại.' : 'Mật khẩu hiện tại chưa đúng.');
    }

    if (action === 'login') {
      setSession(res, row.version);
      return res.json({ signedIn: true, mustRotate: row.must_rotate });
    }

    const updated = await database(table + '?id=eq.1&version=eq.' + version, 'PATCH', {
      password_hash: await passwordHash(nextPassword),
      version: version + 1,
      must_rotate: false
    });
    if (updated.length !== 1) return error(409, 'Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.');
    setSession(res, null);
    return res.json({ signedIn: false, message: 'Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' });
  } catch {
    return error(503, 'Hệ thống tạm thời không kết nối được. Vui lòng thử lại.');
  }
}
