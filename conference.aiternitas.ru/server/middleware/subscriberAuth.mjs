const HEADER_NAME = 'x-subscriber-id';

/**
 * Middleware: извлекает X-Subscriber-Id, проверяет наличие подписчика, кладёт subscriberId в req.
 * При отсутствии или невалидном id возвращает 401.
 */
export function createSubscriberAuthMiddleware(persistence) {
  if (!persistence || typeof persistence.getSubscriberById !== 'function') {
    throw new Error('createSubscriberAuthMiddleware: persistence with getSubscriberById is required');
  }

  return async (req, res, next) => {
    try {
      const subscriberId =
        (typeof HEADER_NAME === 'string' ? req.get(HEADER_NAME) : null) ||
        req.headers?.[HEADER_NAME] ||
        null;

      if (!subscriberId || typeof subscriberId !== 'string' || subscriberId.trim().length === 0) {
        res.status(401).json({
          success: false,
          error: 'Требуется заголовок X-Subscriber-Id.',
          code: 'SUBSCRIBER_REQUIRED',
        });
        return;
      }

      const subscriber = await persistence.getSubscriberById(subscriberId.trim());
      if (!subscriber) {
        res.status(401).json({
          success: false,
          error: 'Подписчик не найден. Сначала зарегистрируйтесь.',
          code: 'SUBSCRIBER_NOT_FOUND',
        });
        return;
      }

      req.subscriberId = subscriber.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default createSubscriberAuthMiddleware;
