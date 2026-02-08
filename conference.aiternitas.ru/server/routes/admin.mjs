import { getOnlineIds, isRedisAvailable } from '../services/redis.mjs';
import { getAllOnlineSubscriberIds } from '../sockets/chat.mjs';

/** Middleware: проверяет, что subscriber имеет role=admin. Используется после subscriberAuth. */
function adminOnly(persistence) {
  return async (req, res, next) => {
    try {
      const ok = await persistence.isAdmin(req.subscriberId);
      if (!ok) return res.status(403).json({ success: false, error: 'Доступ запрещён' });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function registerAdminRoutes({ app, persistence, io, subscriberAuth, logger }) {
  const requireAdmin = adminOnly(persistence);

  /** GET /api/admin/online — список онлайн пользователей (из Redis или памяти) */
  app.get('/api/admin/online', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      let ids = [];
      if (isRedisAvailable()) {
        ids = await getOnlineIds();
      } else {
        ids = getAllOnlineSubscriberIds();
      }
      const subscribers = [];
      for (const id of ids) {
        try {
          const sub = await persistence.getSubscriberById(id);
          subscribers.push({
            id,
            name: sub?.name || id,
            avatarUrl: sub?.avatarUrl || null,
          });
        } catch {
          subscribers.push({ id, name: id, avatarUrl: null });
        }
      }
      res.json({
        success: true,
        online: subscribers,
        total: subscribers.length,
        source: isRedisAvailable() ? 'redis' : 'memory',
      });
    } catch (err) {
      logger?.error?.({ err }, 'Admin online list error');
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  /** GET /api/admin/stats — сводка для админки */
  app.get('/api/admin/stats', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      let onlineIds = [];
      if (isRedisAvailable()) {
        onlineIds = await getOnlineIds();
      } else {
        onlineIds = getAllOnlineSubscriberIds();
      }
      const connections = io?.engine?.clientsCount ?? 0;
      res.json({
        success: true,
        onlineCount: onlineIds.length,
        socketConnections: connections,
        redisAvailable: isRedisAvailable(),
      });
    } catch (err) {
      logger?.error?.({ err }, 'Admin stats error');
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  /** GET /api/admin/settings/jwt-ttl — текущее время жизни JWT токена (в секундах) */
  app.get('/api/admin/settings/jwt-ttl', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const ttlSeconds = await persistence.getJwtTtlSeconds();
      res.json({ success: true, ttlSeconds });
    } catch (err) {
      logger?.error?.({ err }, 'Admin get jwt-ttl error');
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  /** PUT /api/admin/settings/jwt-ttl — установить время жизни JWT токена (в секундах) */
  app.put('/api/admin/settings/jwt-ttl', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const { ttlSeconds } = req.body || {};
      const sec = parseInt(String(ttlSeconds), 10);
      if (!Number.isFinite(sec) || sec < 60 || sec > 31536000) {
        return res.status(400).json({ success: false, error: 'ttlSeconds должен быть от 60 до 31536000 (год)' });
      }
      await persistence.setJwtTtlSeconds(sec);
      res.json({ success: true, ttlSeconds: sec });
    } catch (err) {
      logger?.error?.({ err }, 'Admin set jwt-ttl error');
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });
}
