const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;

export function createRateLimiter(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_LIMIT,
    keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'global',
    skip = () => false,
    message = 'Превышено допустимое число запросов. Попробуйте позже.',
    code = 'TOO_MANY_REQUESTS',
    onLimit,
  } = options;

  if (typeof windowMs !== 'number' || windowMs <= 0) {
    throw new Error('createRateLimiter: windowMs должен быть положительным числом.');
  }

  if (typeof max !== 'number' || max <= 0) {
    throw new Error('createRateLimiter: max должен быть положительным числом.');
  }

  const hits = new Map();
  let lastCleanup = Date.now();

  const cleanup = (now) => {
    if (now - lastCleanup < windowMs) {
      return;
    }

    lastCleanup = now;
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  };

  return (req, res, next) => {
    if (skip(req)) {
      next();
      return;
    }

    const now = Date.now();
    cleanup(now);

    const key = keyGenerator(req) || 'global';
    const existing = hits.get(key);
    const resetAt = existing && existing.resetAt > now ? existing.resetAt : now + windowMs;
    const count = existing && existing.resetAt > now ? existing.count + 1 : 1;
    const entry = { count, resetAt };

    hits.set(key, entry);

    const remaining = Math.max(0, max - count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining >= 0 ? remaining : 0));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      const retryAfterSeconds = Math.ceil((resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));

      if (typeof onLimit === 'function') {
        try {
          onLimit({ req, key, entry });
        } catch (error) {
          // Игнорируем ошибки обработчика превышения лимита, чтобы не мешать основному потоку.
          console.warn('⚠️ createRateLimiter.onLimit вызвал ошибку:', error);
        }
      }

      res.status(429).json({
        success: false,
        error: message,
        code,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

export default createRateLimiter;

