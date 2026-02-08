import { sanitizeDisplayName, sortSubscribers } from '../utils/subscriberUtils.mjs';
import { createRequestValidator, stringField } from '../middleware/validation.mjs';

function assertPersistence(persistence) {
  if (!persistence) {
    throw new Error('registerSubscriberRoutes: persistence service is not provided');
  }
  const required = ['listSubscribers', 'upsertSubscriber', 'getSubscriberById'];
  const missing = required.filter((method) => typeof persistence[method] !== 'function');
  if (missing.length) {
    throw new Error(
      `registerSubscriberRoutes: persistence is missing methods: ${missing.join(', ')}`,
    );
  }
}

const safeSubscriber = (s) => s ? { id: s.id, name: s.name, avatarUrl: s.avatarUrl || null } : null;
const safeList = (list) => (list || []).map(safeSubscriber);

export function registerSubscriberRoutes({ app, persistence, io, logger }) {
  if (!app) {
    throw new Error('registerSubscriberRoutes: app instance is required');
  }
  assertPersistence(persistence);

  const scopedLogger =
    logger && typeof logger.child === 'function'
      ? logger.child({ scope: 'routes:subscribers' })
      : logger || console;

  const validateSubscriberUpsert = createRequestValidator({
    body: {
      id: stringField({ required: true, maxLength: 128, label: 'id' }),
      name: stringField({
        required: true,
        maxLength: 64,
        sanitize: sanitizeDisplayName,
        label: 'name',
      }),
    },
  });

  app.get('/api/subscribers', async (req, res) => {
    try {
      const subscribers = await persistence.listSubscribers();
      res.json({
        success: true,
        subscribers: safeList(sortSubscribers(subscribers)),
      });
    } catch (error) {
      scopedLogger.error('Ошибка чтения списка подписчиков', {
        error: error?.message || error,
      });
      res.status(500).json({
        success: false,
        error: 'Не удалось получить список подписчиков',
      });
    }
  });

  app.get('/api/subscribers/search', async (req, res) => {
    try {
      const q = (req.query?.q || '').trim();
      let subscribers = await persistence.listSubscribers();
      if (q) {
        const lower = q.toLowerCase();
        subscribers = subscribers.filter(
          (s) =>
            (s.name && s.name.toLowerCase().includes(lower)) ||
            (s.id && s.id.toLowerCase().includes(lower))
        );
      }
      res.json({
        success: true,
        subscribers: safeList(sortSubscribers(subscribers)),
      });
    } catch (error) {
      scopedLogger.error('Ошибка поиска подписчиков', { error: error?.message || error });
      res.status(500).json({
        success: false,
        error: 'Не удалось выполнить поиск',
      });
    }
  });

  app.post('/api/subscribers', validateSubscriberUpsert, async (req, res) => {
    try {
      const { id: subscriberId, name: displayName } = req.validated.body;
      const existing = await persistence.getSubscriberById(subscriberId);

      // Не перезаписывать данные пользователя с паролем (защита от перезаписи)
      if (existing && existing.passwordHash) {
        res.json({
          success: true,
          subscriber: safeSubscriber(existing),
          subscribers: safeList(await persistence.listSubscribers()),
        });
        return;
      }

      const subscriber = await persistence.upsertSubscriber({
        id: subscriberId,
        name: displayName,
      });
      const subscribers = await persistence.listSubscribers();

      const safeSubscribers = safeList(subscribers);
      if (io) {
        io.emit('subscribers:update', { subscribers: safeSubscribers });
      }

      scopedLogger.info('Подписчик сохранён', {
        subscriberId,
        operation: existing ? 'update' : 'create',
      });

      res.json({
        success: true,
        subscriber: safeSubscriber(subscriber),
        subscribers: safeSubscribers,
      });
    } catch (error) {
      scopedLogger.error('Ошибка сохранения подписчика', {
        error: error?.message || error,
      });
      res.status(500).json({
        success: false,
        error: 'Не удалось сохранить подписчика',
      });
    }
  });
}

export default registerSubscriberRoutes;

