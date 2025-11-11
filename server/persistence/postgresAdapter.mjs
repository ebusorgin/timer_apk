import { Pool } from 'pg';

const TABLES = {
  subscribers: `
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `,
  calls: `
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      to_id TEXT NOT NULL,
      to_name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      status TEXT NOT NULL
    )
  `,
};

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS calls_to_id_idx ON calls(to_id)`,
  `CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status)`,
  `CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls(created_at)`,
];

const COLLECTIONS = {
  subscribers: {
    table: 'subscribers',
    toRow: (record) => [
      record.id,
      record.name,
      record.createdAt ?? Date.now(),
      record.updatedAt ?? record.createdAt ?? Date.now(),
    ],
    fromRow: (row) => ({
      id: row.id,
      name: row.name,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }),
  },
  users: {
    table: 'users',
    toRow: (record) => [
      record.id,
      record.name,
      record.createdAt ?? Date.now(),
      record.updatedAt ?? record.createdAt ?? Date.now(),
    ],
    fromRow: (row) => ({
      id: row.id,
      name: row.name,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }),
  },
  calls: {
    table: 'calls',
    toRow: (record) => [
      record.id,
      record.from?.id || '',
      record.from?.name || '',
      record.to?.id || '',
      record.to?.name || '',
      record.createdAt ?? Date.now(),
      record.updatedAt ?? record.createdAt ?? Date.now(),
      record.status || 'pending',
    ],
    fromRow: (row) => ({
      id: row.id,
      from: {
        id: row.from_id,
        name: row.from_name,
      },
      to: {
        id: row.to_id,
        name: row.to_name,
      },
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      status: row.status,
    }),
  },
};

const buildInsertStatement = (table, columnsCount) => {
  const placeholders = Array.from({ length: columnsCount }, (_, idx) => `$${idx + 1}`).join(', ');
  return `INSERT INTO ${table} VALUES (${placeholders})`;
};

const runWithClient = async (pool, statementTimeout, fn) => {
  const client = await pool.connect();
  try {
    if (statementTimeout) {
      await client.query('SET statement_timeout TO $1', [statementTimeout]);
    }
    return await fn(client);
  } finally {
    client.release();
  }
};

const ensureSchema = (pool, logger) => {
  let initialized;
  return async () => {
    if (initialized) {
      return initialized;
    }
    initialized = runWithClient(pool, null, async (client) => {
      for (const definition of Object.values(TABLES)) {
        await client.query(definition);
      }
      for (const indexStmt of INDEXES) {
        await client.query(indexStmt);
      }
      logger?.info?.('PostgreSQL persistence schema ensured');
    }).catch((error) => {
      initialized = null;
      throw error;
    });
    return initialized;
  };
};

export function createPostgresAdapter(options = {}) {
  const {
    connectionString,
    ssl,
    pool: poolOptions = {},
    poolInstance,
    statementTimeout,
    logger = console,
  } = options;

  if ((!connectionString || typeof connectionString !== 'string') && !poolInstance) {
    throw new Error(
      'createPostgresAdapter: требуется строка подключения (connectionString) или предоставленный пул соединений.',
    );
  }

  const resolvedPool =
    poolInstance && typeof poolInstance.query === 'function'
      ? poolInstance
      : new Pool({
          connectionString,
          ssl,
          max: poolOptions.max,
          idleTimeoutMillis: poolOptions.idleTimeoutMillis,
        });

  const ensure = ensureSchema(resolvedPool, logger);

  const read = async (key) => {
    const entry = COLLECTIONS[key];
    if (!entry) {
      throw new Error(`createPostgresAdapter.read: неизвестный ключ ${key}`);
    }
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM ${entry.table} ORDER BY created_at ASC`,
    );
    return rows.map(entry.fromRow);
  };

  const write = async (key, records = []) => {
    const entry = COLLECTIONS[key];
    if (!entry) {
      throw new Error(`createPostgresAdapter.write: неизвестный ключ ${key}`);
    }
    await ensure();
    await runWithClient(resolvedPool, statementTimeout, async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`DELETE FROM ${entry.table}`);
        if (records.length > 0) {
          const insertStatement = buildInsertStatement(
            entry.table,
            entry.toRow(records[0]).length,
          );
          for (const record of records) {
            const values = entry.toRow(record);
            await client.query(insertStatement, values);
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  };

  return {
    read,
    write,
    close: () => {
      if (resolvedPool && typeof resolvedPool.end === 'function') {
        return resolvedPool.end();
      }
      return Promise.resolve();
    },
  };
}

export default createPostgresAdapter;

