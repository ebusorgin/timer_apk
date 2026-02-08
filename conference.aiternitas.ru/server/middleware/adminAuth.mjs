import crypto from 'crypto';

const TOKEN_PREFIX = 'admin_';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

function getTokenSecret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'admin-token-secret';
}

function generateAdminToken() {
  const secret = getTokenSecret();
  const t = Date.now();
  const r = crypto.randomBytes(8).toString('hex');
  const msg = `t:${t}:r:${r}`;
  const sig = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  const payload = JSON.stringify({ t, r });
  return TOKEN_PREFIX + Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const t = token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : token;
  const [b64, sig] = t.split('.');
  if (!b64 || !sig) return false;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    const secret = getTokenSecret();
    const msg = `t:${payload.t}:r:${payload.r}`;
    const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
    if (sig !== expected) return false;
    if (Date.now() - payload.t > TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export function createAdminAuthMiddleware() {
  return (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.query?.adminToken || '';
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'Требуется авторизация админа' });
    }
    next();
  };
}

export { generateAdminToken as createAdminToken };
