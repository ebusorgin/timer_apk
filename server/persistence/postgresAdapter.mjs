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

  const toSqlTimestamps = ({ createdAt, updatedAt }) => {
    const created = typeof createdAt === 'number' ? createdAt : Date.now();
    const updated = typeof updatedAt === 'number' ? updatedAt : created;
    return { created, updated };
  };

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

  const listSubscribers = async () => {
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT *
         FROM subscribers
        ORDER BY LOWER(name) ASC, created_at ASC`,
    );
    return rows.map(COLLECTIONS.subscribers.fromRow);
  };

  const getSubscriberById = async (id) => {
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM subscribers WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!rows.length) {
      return null;
    }
    return COLLECTIONS.subscribers.fromRow(rows[0]);
  };

  const upsertSubscriber = async (record) => {
    await ensure();
    const timestamps = toSqlTimestamps(record);
    const { rows } = await resolvedPool.query(
      `
        INSERT INTO subscribers (id, name, created_at, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [record.id, record.name, timestamps.created, timestamps.updated],
    );
    return COLLECTIONS.subscribers.fromRow(rows[0]);
  };

  const upsertUser = async (record) => {
    await ensure();
    const timestamps = toSqlTimestamps(record);
    const { rows } = await resolvedPool.query(
      `
        INSERT INTO users (id, name, created_at, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [record.id, record.name, timestamps.created, timestamps.updated],
    );
    return COLLECTIONS.users.fromRow(rows[0]);
  };

  const replaceUsers = async (records = []) => {
    await ensure();
    await runWithClient(resolvedPool, statementTimeout, async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`DELETE FROM users`);
        if (records.length > 0) {
          const insertStatement = buildInsertStatement('users', 4);
          for (const record of records) {
            const timestamps = toSqlTimestamps(record);
            await client.query(insertStatement, [
              record.id,
              record.name,
              timestamps.created,
              timestamps.updated,
            ]);
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  };

  const insertCall = async (record) => {
    await ensure();
    const timestamps = toSqlTimestamps(record);
    const { rows } = await resolvedPool.query(
      `
        INSERT INTO calls (
          id,
          from_id,
          from_name,
          to_id,
          to_name,
          created_at,
          updated_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id)
        DO UPDATE SET
          from_id = EXCLUDED.from_id,
          from_name = EXCLUDED.from_name,
          to_id = EXCLUDED.to_id,
          to_name = EXCLUDED.to_name,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        record.id,
        record.from.id,
        record.from.name,
        record.to.id,
        record.to.name,
        timestamps.created,
        timestamps.updated,
        record.status,
      ],
    );
    return COLLECTIONS.calls.fromRow(rows[0]);
  };

  const listPendingCalls = async (subscriberId) => {
    await ensure();
    const { rows } = await resolvedPool.query(
      `
        SELECT *
          FROM calls
         WHERE to_id = $1
           AND status = 'pending'
         ORDER BY created_at ASC
      `,
      [subscriberId],
    );
    return rows.map(COLLECTIONS.calls.fromRow);
  };

  const updateCallStatus = async (callId, status, updatedAt = Date.now()) => {
    await ensure();
    const { rows } = await resolvedPool.query(
      `
        UPDATE calls
           SET status = $2,
               updated_at = $3
         WHERE id = $1
         RETURNING *
      `,
      [callId, status, updatedAt],
    );
    if (!rows.length) {
      return null;
    }
    return COLLECTIONS.calls.fromRow(rows[0]);
  };

  const deleteOldNonPendingCalls = async (thresholdTimestamp) => {
    await ensure();
    await resolvedPool.query(
      `
        DELETE FROM calls
         WHERE status <> 'pending'
           AND COALESCE(updated_at, created_at) < $1
      `,
      [thresholdTimestamp],
    );
  };

  return {
    read,
    write,
    listSubscribers,
    getSubscriberById,
    upsertSubscriber,
    upsertUser,
    replaceUsers,
    insertCall,
    listPendingCalls,
    updateCallStatus,
    deleteOldNonPendingCalls,
    close: () => {
      if (resolvedPool && typeof resolvedPool.end === 'function') {
        return resolvedPool.end();
      }
      return Promise.resolve();
    },
  };
}

export default createPostgresAdapter;

