import jwt from 'jsonwebtoken';

const DEFAULT_TTL = 24 * 60 * 60; // 1 день в секундах

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'conference-jwt-secret-change-me';
}

/**
 * Создаёт JWT для пользователя.
 * @param {string} userId - id пользователя
 * @param {number} ttlSeconds - время жизни в секундах
 */
export function createToken(userId, ttlSeconds = DEFAULT_TTL) {
  const secret = getJwtSecret();
  return jwt.sign(
    { sub: String(userId) },
    secret,
    { expiresIn: ttlSeconds }
  );
}

/**
 * Верифицирует JWT и возвращает payload.sub (userId) или null.
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.startsWith('Bearer ') ? token.slice(7) : token;
  if (!t.trim()) return null;
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(t, secret);
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/**
 * Middleware: проверяет Authorization: Bearer <jwt>, валидирует токен, кладёт subscriberId в req.
 */
export function createJwtAuthMiddleware(persistence) {
  return async (req, res, next) => {
    try {
      const auth = req.get('Authorization') || req.headers?.authorization || '';
      const userId = verifyToken(auth);
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Требуется авторизация. Войдите снова.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }
      const user = await persistence.getSubscriberById(userId);
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Пользователь не найден.',
          code: 'USER_NOT_FOUND',
        });
        return;
      }
      req.subscriberId = user.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Для тестов: принимает JWT или X-Subscriber-Id (если Bearer отсутствует).
 */
export function createJwtOrTestAuthMiddleware(persistence) {
  const jwtAuth = createJwtAuthMiddleware(persistence);
  return async (req, res, next) => {
    const auth = req.get('Authorization') || req.headers?.authorization || '';
    if (auth.startsWith('Bearer ') && auth.length > 10) {
      return jwtAuth(req, res, next);
    }
    const xId = req.get('X-Subscriber-Id') || req.headers?.['x-subscriber-id'] || '';
    const sid = (typeof xId === 'string' ? xId : '').trim();
    if (sid) {
      const user = await persistence.getSubscriberById(sid);
      if (user) {
        req.subscriberId = user.id;
        return next();
      }
      res.status(401).json({
        success: false,
        error: 'Пользователь не найден.',
        code: 'USER_NOT_FOUND',
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: 'Требуется авторизация.',
      code: 'AUTH_REQUIRED',
    });
  };
}

export default { createToken, verifyToken, createJwtAuthMiddleware, createJwtOrTestAuthMiddleware };
