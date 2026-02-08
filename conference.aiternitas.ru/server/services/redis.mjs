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
  try {
    await client.sadd(KEY_ONLINE, String(subscriberId).trim());
  } catch (err) {
    console.warn('[Redis] addOnline:', err.message);
  }
}

export async function removeOnline(subscriberId) {
  if (!client || client.status !== 'ready' || !subscriberId) return;
  try {
    await client.srem(KEY_ONLINE, String(subscriberId).trim());
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
