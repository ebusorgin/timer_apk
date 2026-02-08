import { getBulkPresenceStatus } from '../sockets/chat.mjs';

const MAX_IDS = 100;

export function registerPresenceRoutes({ app, subscriberAuth, logger }) {
  const scopedLogger = logger?.child?.({ scope: 'routes:presence' }) ?? logger ?? console;

  /** GET /api/presence/status?ids=id1,id2 — статус онлайн для контактов (для звонков) */
  app.get('/api/presence/status', subscriberAuth, (req, res) => {
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
    const status = getBulkPresenceStatus(ids);
    res.json({ success: true, status });
  });
}

export default registerPresenceRoutes;
