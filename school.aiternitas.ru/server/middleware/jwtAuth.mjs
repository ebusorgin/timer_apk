import jwt from 'jsonwebtoken';

const DEFAULT_TTL = 7 * 24 * 60 * 60;

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'school-jwt-secret-change-me';
}

export function createToken(userId, ttlSeconds = DEFAULT_TTL) {
  return jwt.sign({ sub: String(userId) }, getJwtSecret(), { expiresIn: ttlSeconds });
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.startsWith('Bearer ') ? token.slice(7) : token;
  if (!t.trim()) return null;
  try {
    const payload = jwt.verify(t, getJwtSecret());
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

export function createJwtAuthMiddleware(persistence) {
  return async (req, res, next) => {
    try {
      const auth = req.get('Authorization') || req.headers?.authorization || '';
      const userId = verifyToken(auth);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Требуется авторизация.', code: 'AUTH_REQUIRED' });
        return;
      }
      const user = await persistence.getUserById(userId);
      if (!user) {
        res.status(401).json({ success: false, error: 'Пользователь не найден.', code: 'USER_NOT_FOUND' });
        return;
      }
      req.userId = user.id;
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createRoleAuthMiddleware(persistence, allowedRoles) {
  const jwtAuth = createJwtAuthMiddleware(persistence);
  return async (req, res, next) => {
    await jwtAuth(req, res, async () => {
      if (!allowedRoles.includes(req.user?.role)) {
        res.status(403).json({ success: false, error: 'Доступ запрещён.', code: 'FORBIDDEN' });
        return;
      }
      next();
    });
  };
}
