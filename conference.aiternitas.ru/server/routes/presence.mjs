import { getBulkPresenceStatus as getBulkPresenceFromMemory } from '../sockets/chat.mjs';
import { isRedisAvailable, getBulkPresenceStatus as getBulkPresenceFromRedis } from '../services/redis.mjs';

const MAX_IDS = 100;

export function registerPresenceRoutes({ app, subscriberAuth, logger }) {
  const scopedLogger = logger?.child?.({ scope: 'routes:presence' }) ?? logger ?? console;

  /** GET /api/presence/status?ids=id1,id2 — статус онлайн из Redis (или in-memory fallback) */
  app.get('/api/presence/status', subscriberAuth, async (req, res) => {
    const raw = req.query.ids;
    const ids = typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    if (ids.length > MAX_IDS) {
      return res.status(400).json({
        success: false,
        error: `Максимум ${MAX_IDS} идентификаторов`,
      });
    }
    const status = isRedisAvailable()
      ? await getBulkPresenceFromRedis(ids)
      : getBulkPresenceFromMemory(ids);
    res.json({ success: true, status });
  });
}

export default registerPresenceRoutes;
