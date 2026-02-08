let redisClient = null;

export async function initRedis(options = {}) {
  const url = options.url || process.env.REDIS_URL;
  if (!url) return null;
  try {
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(url);
    redisClient.on('error', (err) => console.warn('Redis error:', err.message));
    return redisClient;
  } catch (err) {
    console.warn('Redis init failed:', err.message);
    return null;
  }
}

export function getRedis() {
  return redisClient;
}
