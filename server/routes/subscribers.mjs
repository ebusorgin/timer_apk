import { sanitizeDisplayName, sortSubscribers } from '../utils/subscriberUtils.mjs';
import { createRequestValidator, stringField } from '../middleware/validation.mjs';

function assertPersistence(persistence) {
  if (!persistence) {
    throw new Error('registerSubscriberRoutes: persistence service is not provided');
  }
  const required = ['readSubscribers', 'writeSubscribers', 'writeUsers'];
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
      const subscribers = await persistence.readSubscribers();
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
      const subscribers = await persistence.readSubscribers();
      const timestamp = Date.now();
      const existingIndex = subscribers.findIndex((item) => item.id === subscriberId);

      if (existingIndex >= 0) {
        subscribers[existingIndex] = {
          ...subscribers[existingIndex],
          name: displayName,
          updatedAt: timestamp,
        };
      } else {
        subscribers.push({
          id: subscriberId,
          name: displayName,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      const ordered = sortSubscribers(subscribers);
      await persistence.writeSubscribers(ordered);
      await persistence.writeUsers(ordered);

      const currentSubscriber =
        ordered.find((item) => item.id === subscriberId) ||
        subscribers.find((item) => item.id === subscriberId);

      if (io) {
        io.emit('subscribers:update', {
          subscribers: ordered,
        });
      }

      scopedLogger.info('Подписчик сохранён', {
        subscriberId,
        operation: existingIndex >= 0 ? 'update' : 'create',
      });

      res.json({
        success: true,
        subscriber: currentSubscriber,
        subscribers: ordered,
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

