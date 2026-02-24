import path from 'path';
import fs, { existsSync, mkdirSync } from 'fs';
import multer from 'multer';
import { createRequestValidator, stringField } from '../middleware/validation.mjs';
import { isPushAvailable } from '../services/push.mjs';

function assertPersistence(persistence) {
  if (!persistence) throw new Error('registerMeProfileRoutes: persistence is required');
  const required = ['getSubscriberById', 'upsertSubscriber', 'isAdmin', 'savePushSubscription'];
  const missing = required.filter((m) => typeof persistence[m] !== 'function');
  if (missing.length) throw new Error(`registerMeProfileRoutes: persistence missing: ${missing.join(', ')}`);
}

export function registerMeProfileRoutes({ app, persistence, subscriberAuth, config, logger }) {
  if (!app) throw new Error('registerMeProfileRoutes: app is required');
  assertPersistence(persistence);

  const log = logger?.child?.({ scope: 'routes:meProfile' }) || logger || console;

  const dataDir = config?.paths?.dataDir || path.join(process.cwd(), 'server', 'data');
  const avatarsDir = path.join(dataDir, 'avatars');
  if (!existsSync(avatarsDir)) {
    mkdirSync(avatarsDir, { recursive: true });
  }

  // Multer storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, req.subscriberId + ext);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Допускаются только JPG, PNG, WebP'), false);
  };

  const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

  const validateUpdateProfile = createRequestValidator({
    body: {
      name: stringField({ required: true, maxLength: 64, label: 'name' }),
    },
  });

  // Serve avatars
  app.use('/uploads/avatars', (req, res, next) => {
    const fileName = req.path.replace(/^\//, '');
    if (!fileName || fileName.includes('..')) {
      res.status(404).end();
      return;
    }
    const localPath = path.join(avatarsDir, fileName);
    res.sendFile(fileName, { root: avatarsDir, dotfiles: 'deny' }, (err) => {
      if (err) res.status(404).end();
    });
  });

  // GET /api/me/is-admin — проверка, является ли текущий подписчик админом (видит ссылку на админку)
  app.get('/api/me/is-admin', subscriberAuth, async (req, res) => {
    try {
      const ok = await persistence.isAdmin(req.subscriberId);
      res.json({ success: true, isAdmin: !!ok });
    } catch (err) {
      res.json({ success: true, isAdmin: false });
    }
  });

  // GET /api/me/profile
  app.get('/api/me/profile', subscriberAuth, async (req, res) => {
    try {
      const subscriber = await persistence.getSubscriberById(req.subscriberId);
      if (!subscriber) {
        res.status(404).json({ success: false, error: 'Пользователь не найден' });
        return;
      }
      res.json({
        success: true,
        profile: {
          id: subscriber.id,
          name: subscriber.name,
          avatarUrl: subscriber.avatarUrl || null,
        },
      });
    } catch (error) {
      log.error?.('Ошибка получения профиля', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось получить профиль' });
    }
  });

  // PUT /api/me/profile
  app.put('/api/me/profile', subscriberAuth, validateUpdateProfile, async (req, res) => {
    try {
      const name = (req.validated?.body?.name || '').trim();
      const subscriber = await persistence.upsertSubscriber({
        id: req.subscriberId,
        name,
      });
      res.json({
        success: true,
        profile: {
          id: subscriber.id,
          name: subscriber.name,
          avatarUrl: subscriber.avatarUrl || null,
        },
      });
    } catch (error) {
      log.error?.('Ошибка обновления профиля', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось обновить профиль' });
    }
  });

  // GET /api/me/push-public-key — публичный ключ VAPID для подписки на push
  app.get('/api/me/push-public-key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY || '';
    res.json({ publicKey: key, available: isPushAvailable() });
  });

  // POST /api/me/push-subscription — сохранить push-подписку для уведомлений (контакты, звонки)
  app.post('/api/me/push-subscription', subscriberAuth, (req, res) => {
    const sub = req.body?.subscription || req.body;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      res.status(400).json({ success: false, error: 'Некорректная push-подписка' });
      return;
    }
    persistence
      .savePushSubscription(req.subscriberId, sub)
      .then(() => res.json({ success: true }))
      .catch((err) => {
        log.error?.('Ошибка сохранения push-подписки', { error: err?.message });
        res.status(500).json({ success: false, error: 'Не удалось сохранить подписку' });
      });
  });

  // POST /api/me/fcm-token — сохранить FCM-токен для full-screen звонков (APK)
  app.post('/api/me/fcm-token', subscriberAuth, (req, res) => {
    const token = req.body?.token ?? req.body?.fcmToken ?? req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ success: false, error: 'Некорректный FCM-токен' });
      return;
    }
    if (typeof persistence.saveFcmToken !== 'function') {
      res.status(500).json({ success: false, error: 'FCM не поддерживается' });
      return;
    }
    persistence
      .saveFcmToken(req.subscriberId, token.trim())
      .then(() => res.json({ success: true }))
      .catch((err) => {
        log.error?.('Ошибка сохранения FCM-токена', { error: err?.message });
        res.status(500).json({ success: false, error: 'Не удалось сохранить токен' });
      });
  });

  // POST /api/me/avatar
  app.post('/api/me/avatar', subscriberAuth, (req, res, next) => {
    upload.single('avatar')(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          res.status(400).json({ success: false, error: 'Файл слишком большой (макс. 2 MB)' });
        } else {
          res.status(400).json({ success: false, error: err.message || 'Ошибка загрузки' });
        }
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Файл не загружен' });
        return;
      }
      try {
        const avatarUrl = '/uploads/avatars/' + req.file.filename;

        const subscriber = await persistence.upsertSubscriber({
          id: req.subscriberId,
          name: (await persistence.getSubscriberById(req.subscriberId))?.name || '',
          avatarUrl,
        });
        res.json({
          success: true,
          avatarUrl: subscriber.avatarUrl || avatarUrl,
        });
      } catch (error) {
        log.error?.('Ошибка загрузки аватарки', { error: error?.message });
        res.status(500).json({ success: false, error: 'Не удалось сохранить аватарку' });
      }
    });
  });
}

export default registerMeProfileRoutes;
