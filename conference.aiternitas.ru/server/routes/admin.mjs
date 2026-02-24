import { getOnlineIds, isRedisAvailable } from '../services/redis.mjs';
import { getAllOnlineSubscriberIds } from '../sockets/chat.mjs';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

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
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });

  /** GET /api/admin/subscribers — список всех пользователей с пагинацией */
  app.get('/api/admin/subscribers', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const { items, total } = await persistence.listSubscribersPaged(offset, limit);

      res.json({
        success: true,
        subscribers: items.map(s => ({
          id: s.id,
          login: s.login,
          name: s.name,
          role: s.role,
          avatarUrl: s.avatarUrl,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      logger?.error?.({ err }, 'Admin subscribers list error');
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
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
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });

  /** GET /api/admin/settings/jwt-ttl */
  app.get('/api/admin/settings/jwt-ttl', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const ttlSeconds = await persistence.getJwtTtlSeconds();
      res.json({ success: true, ttlSeconds });
    } catch (err) {
      logger?.error?.({ err }, 'Admin get jwt-ttl error');
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });

  /** PUT /api/admin/settings/jwt-ttl */
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
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });

  /** GET /api/admin/subscribers/:id — профиль пользователя */
  app.get('/api/admin/subscribers/:id', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const sub = await persistence.getSubscriberById(req.params.id);
      if (!sub) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      res.json({
        success: true,
        subscriber: {
          id: sub.id,
          login: sub.login,
          name: sub.name,
          role: sub.role || 'user',
          avatarUrl: sub.avatarUrl || null,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt,
        },
      });
    } catch (err) {
      logger?.error?.({ err }, 'Admin get subscriber error');
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });

  /** PUT /api/admin/subscribers/:id — редактирование пользователя */
  app.put('/api/admin/subscribers/:id', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const sub = await persistence.getSubscriberById(req.params.id);
      if (!sub) return res.status(404).json({ success: false, error: 'Пользователь не найден' });

      const { name, role, password } = req.body || {};

      // Fix: Preserve existing role if not provided or invalid
      const newRole = (role && (role === 'admin' || role === 'user')) ? role : sub.role;

      const update = {
        id: sub.id,
        name: name || sub.name,
        role: newRole,
        avatarUrl: sub.avatarUrl // Preserve avatar
      };

      if (password && password.length >= 4) {
        update.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      }

      const updated = await persistence.upsertSubscriber(update);
      res.json({
        success: true,
        subscriber: {
          id: updated.id,
          login: updated.login,
          name: updated.name,
          role: updated.role || 'user',
          avatarUrl: updated.avatarUrl || null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err) {
      logger?.error?.({ err }, 'Admin update subscriber error');
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        message: err.message,
        code: err.code,
        detail: err.detail
      });
    }
  });

  /** DELETE /api/admin/subscribers/:id — удаление пользователя */
  app.delete('/api/admin/subscribers/:id', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      if (String(req.params.id) === String(req.subscriberId)) {
        return res.status(400).json({ success: false, error: 'Нельзя удалить самого себя' });
      }
      const ok = await persistence.deleteSubscriber(req.params.id);
      if (!ok) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      res.json({ success: true });
    } catch (err) {
      logger?.error?.({ err }, 'Admin delete subscriber error');
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        message: err.message,
        code: err.code,
        detail: err.detail
      });
    }
  });

  /** POST /api/admin/subscribers — создание нового пользователя */
  app.post('/api/admin/subscribers', subscriberAuth, requireAdmin, async (req, res) => {
    try {
      const { login, name, password, role } = req.body || {};
      if (!login || !name || !password) {
        return res.status(400).json({ success: false, error: 'login, name и password обязательны' });
      }
      if (password.length < 4) {
        return res.status(400).json({ success: false, error: 'Пароль должен быть минимум 4 символа' });
      }
      const existing = await persistence.getSubscriberByLogin(login.trim());
      if (existing) {
        return res.status(409).json({ success: false, error: 'Пользователь с таким логином уже существует' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const subscriber = await persistence.insertSubscriber({
        login: login.trim(),
        name: name.trim(),
        passwordHash,
        role: (role === 'admin') ? 'admin' : 'user',
      });

      res.json({
        success: true,
        subscriber: {
          id: subscriber.id,
          login: subscriber.login,
          name: subscriber.name,
          role: subscriber.role || 'user',
          avatarUrl: subscriber.avatarUrl || null,
          createdAt: subscriber.createdAt,
          updatedAt: subscriber.updatedAt,
        },
      });
    } catch (err) {
      if (err?.message === 'DUPLICATE_LOGIN') {
        return res.status(409).json({ success: false, error: 'Пользователь с таким логином уже существует' });
      }
      logger?.error?.({ err }, 'Admin create subscriber error');
      res.status(500).json({ success: false, error: 'Ошибка сервера', message: err.message });
    }
  });
}
