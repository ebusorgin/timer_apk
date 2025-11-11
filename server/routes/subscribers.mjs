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
        subscribers: sortSubscribers(subscribers),
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

  app.post('/api/subscribers', validateSubscriberUpsert, async (req, res) => {
    try {
      const { id: subscriberId, name: displayName } = req.validated.body;
      const existing = await persistence.getSubscriberById(subscriberId);
      const subscriber = await persistence.upsertSubscriber({
        id: subscriberId,
        name: displayName,
      });
      const subscribers = await persistence.listSubscribers();

      if (io) {
        io.emit('subscribers:update', {
          subscribers,
        });
      }

      scopedLogger.info('Подписчик сохранён', {
        subscriberId,
        operation: existing ? 'update' : 'create',
      });

      res.json({
        success: true,
        subscriber,
        subscribers,
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

