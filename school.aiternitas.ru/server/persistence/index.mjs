import { createPostgresAdapter } from './postgresAdapter.mjs';

export async function createPersistence(config, logger) {
  const { connectionString, pool } = config;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const adapter = createPostgresAdapter(
    {
      connectionString,
      ...pool,
    },
    logger
  );
  await adapter.ensureSchema();
  return adapter;
}

export default createPersistence;
