import { database, hasStudioSession } from './auth.js';

const table = 'kim_flora_lab_backups';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, message) => res.status(status).json({message});
  try {
    if (!(await hasStudioSession(req))) return fail(401, 'Vui lòng đăng nhập lại.');
    if (req.method === 'GET' && !req.query.snapshot) {
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return fail(400, 'Trang lịch sử không hợp lệ.');
      const rows = await database(table + '?part=eq.-1&select=snapshot,data,created_at&order=created_at.desc,snapshot.asc&limit=50&offset=' + offset);
      return res.json(rows.map(row => ({id:row.snapshot, parts:Number(row.data), date:row.created_at})));
    }
    const {snapshot, part:rawPart, data} = req.method === 'GET' ? req.query : req.body ?? {};
    const part = Number(rawPart);
    if (typeof snapshot !== 'string' || !/^[0-9a-f]{64}$/.test(snapshot) ||
        rawPart === undefined || !Number.isInteger(part) || part < -1 || part > 998) {
      return fail(400, 'Thông tin bản sao không hợp lệ.');
    }
    const record = table + '?snapshot=eq.' + snapshot + '&part=eq.' + part;
    if (req.method === 'GET') {
      const [row] = await database(record + '&select=data');
      return row ? res.json(row) : fail(404, 'Không tìm thấy phần dữ liệu.');
    }
    if (req.method !== 'POST') return fail(405, 'Phương thức không được hỗ trợ.');
    if (req.headers.origin !== 'https://' + req.headers.host ||
        req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return fail(403, 'Yêu cầu không hợp lệ.');
    }
    if (typeof data !== 'string' || (part === -1
      ? !/^\d{1,4}$/.test(data) || Number(data) < 1 || Number(data) > 999
      : !/^[A-Za-z0-9+/=]{1,700000}$/.test(data))) return fail(400, 'Dữ liệu bản sao không hợp lệ.');
    if (part === -1) {
      const parts = await database(table + '?snapshot=eq.' + snapshot +
        '&part=gte.0&part=lt.' + data + '&select=part&limit=' + data);
      if (parts.length !== Number(data)) return fail(409, 'Bản sao chưa tải lên đầy đủ.');
    }
    await database(table, 'POST', {snapshot,part,data}, 'resolution=ignore-duplicates,return=minimal');
    return res.json({saved:true});
  } catch {
    return fail(503, 'Chưa kết nối được kho lưu trực tuyến.');
  }
}
