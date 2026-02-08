import Redis from 'ioredis';

const KEY_ONLINE = 'presence:online';
let client = null;

export function createRedisClient(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null;
  }
  try {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      console.warn('[Redis] Ошибка:', err.message);
    });
    return redis;
  } catch (err) {
    console.warn('[Redis] Не удалось создать клиент:', err.message);
    return null;
  }
}

export async function initRedis(config = {}) {
  const url = config.url || config.connectionUrl || process.env.REDIS_URL;
  if (!url) return null;
  client = createRedisClient(url);
  if (client) {
    try {
      await client.connect();
      return client;
    } catch (err) {
      console.warn('[Redis] Не удалось подключиться:', err.message);
      client = null;
      return null;
    }
  }
  return null;
}

export function getRedisClient() {
  return client;
}

export function isRedisAvailable() {
  return client && client.status === 'ready';
}

export async function addOnline(subscriberId) {
  if (!client || client.status !== 'ready' || !subscriberId) return;
  const id = String(subscriberId).trim();
  try {
    await client.sadd(KEY_ONLINE, id);
    await publishPresenceEvent('online', id);
  } catch (err) {
    console.warn('[Redis] addOnline:', err.message);
  }
}

export async function removeOnline(subscriberId) {
  if (!client || client.status !== 'ready' || !subscriberId) return;
  const id = String(subscriberId).trim();
  try {
    await client.srem(KEY_ONLINE, id);
    await publishPresenceEvent('offline', id);
  } catch (err) {
    console.warn('[Redis] removeOnline:', err.message);
  }
}

/** Возвращает список ID пользователей онлайн из Redis */
export async function getOnlineIds() {
  if (!client || client.status !== 'ready') return [];
  try {
    const ids = await client.smembers(KEY_ONLINE);
    return Array.isArray(ids) ? ids : [];
  } catch (err) {
    console.warn('[Redis] getOnlineIds:', err.message);
    return [];
  }
}

const CHANNEL_PRESENCE = 'presence:events';

/** Публикует событие онлайн/офлайн для триггеров (Pub/Sub) */
export async function publishPresenceEvent(event, subscriberId) {
  if (!client || client.status !== 'ready' || !subscriberId) return;
  try {
    await client.publish(CHANNEL_PRESENCE, JSON.stringify({ event, subscriberId: String(subscriberId).trim() }));
  } catch (err) {
    console.warn('[Redis] publishPresenceEvent:', err.message);
  }
}

/** Подписка на события presence (для multi-instance или триггеров) */
export function subscribePresenceEvents(callback) {
  if (!client || client.status !== 'ready') return null;
  try {
    const sub = client.duplicate();
    sub.subscribe(CHANNEL_PRESENCE);
    sub.on('message', (ch, msg) => {
      if (ch === CHANNEL_PRESENCE && callback) {
        try {
          const data = JSON.parse(msg);
          callback(data.event, data.subscriberId);
        } catch (e) {
          console.warn('[Redis] subscribePresenceEvents parse:', e?.message);
        }
      }
    });
    return sub;
  } catch (err) {
    console.warn('[Redis] subscribePresenceEvents:', err.message);
    return null;
  }
}

/** Bulk status из Redis: { [subscriberId]: boolean } */
export async function getBulkPresenceStatus(subscriberIds) {
  if (!client || client.status !== 'ready' || !Array.isArray(subscriberIds)) return {};
  const result = {};
  try {
    const pipeline = client.pipeline();
    for (const id of subscriberIds) {
      if (id && typeof id === 'string') {
        const tid = id.trim();
        if (tid) pipeline.sismember(KEY_ONLINE, tid);
      }
    }
    const replies = await pipeline.exec();
    let idx = 0;
    for (const id of subscriberIds) {
      if (id && typeof id === 'string') {
        const tid = id.trim();
        if (tid) {
          const [err, val] = replies[idx++] || [];
          result[tid] = !err && val === 1;
        }
      }
    }
    return result;
  } catch (err) {
    console.warn('[Redis] getBulkPresenceStatus:', err.message);
    return {};
  }
}

export async function closeRedis() {
  if (client) {
    try {
      await client.quit();
    } catch (err) {
      console.warn('[Redis] Ошибка при закрытии:', err.message);
    }
    client = null;
  }
}
