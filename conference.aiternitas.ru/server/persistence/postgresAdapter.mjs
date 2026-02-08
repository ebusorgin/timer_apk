import { Pool } from 'pg';

const toSqlTimestamps = (record) => {
  const created = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
  const updated = typeof record.updatedAt === 'number' ? record.updatedAt : created;
  return { created, updated };
};

const normalizeId = (id) => {
  if (id == null) return null;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
};

const ensureSchema = (pool, logger) => {
  let initialized;
  return async () => {
    if (initialized) return initialized;
    initialized = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          login TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          avatar_url TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)
      `);
      await pool.query(`INSERT INTO app_settings (key, value) VALUES ('jwt_ttl_seconds', '86400') ON CONFLICT (key) DO NOTHING`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id BIGSERIAL PRIMARY KEY,
          owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          UNIQUE(owner_id, contact_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS contacts_owner_id_idx ON contacts(owner_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS calls (
          id BIGSERIAL PRIMARY KEY,
          from_id BIGINT NOT NULL REFERENCES users(id),
          from_name TEXT NOT NULL,
          to_id BIGINT NOT NULL REFERENCES users(id),
          to_name TEXT NOT NULL,
          call_type TEXT NOT NULL DEFAULT 'audio',
          status TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS calls_to_id_idx ON calls(to_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls(created_at)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id BIGSERIAL PRIMARY KEY,
          from_id BIGINT NOT NULL REFERENCES users(id),
          to_id BIGINT NOT NULL REFERENCES users(id),
          body TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS chat_messages_from_to_idx ON chat_messages(from_id, to_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_requests (
          id BIGSERIAL PRIMARY KEY,
          from_id BIGINT NOT NULL REFERENCES users(id),
          from_name TEXT NOT NULL,
          to_id BIGINT NOT NULL REFERENCES users(id),
          to_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at BIGINT NOT NULL,
          updated_at BIGINT
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS contact_requests_to_id_idx ON contact_requests(to_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS contact_requests_from_id_idx ON contact_requests(from_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS contact_requests_status_idx ON contact_requests(status)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          subscriber_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (subscriber_id)
        )
      `);

      logger?.info?.('PostgreSQL persistence schema ensured');
    })();
    return initialized;
  };
};

const subscriberFromRow = (row) => {
  const r = {
    id: String(row.id),
    login: row.login,
    name: row.name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
  if (row.password_hash) r.passwordHash = row.password_hash;
  if (row.avatar_url) r.avatarUrl = row.avatar_url;
  if (row.role) r.role = row.role;
  return r;
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
    throw new Error('createPostgresAdapter: требуется connectionString или poolInstance.');
  }

  const resolvedPool =
    poolInstance && typeof poolInstance.query === 'function'
      ? poolInstance
      : new Pool({ connectionString, ssl, ...poolOptions });

  const ensure = ensureSchema(resolvedPool, logger);

  const listSubscribers = async () => {
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM users ORDER BY LOWER(name) ASC, created_at ASC`
    );
    return rows.map(subscriberFromRow);
  };

  const getSubscriberById = async (id) => {
    const nid = normalizeId(id);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [nid]);
    if (!rows.length) return null;
    return subscriberFromRow(rows[0]);
  };

  const getSubscriberByLogin = async (login) => {
    if (!login || typeof login !== 'string' || !login.trim()) return null;
    await ensure();
    const trimmed = String(login).trim();
    // Поиск по логину (без учёта регистра) или по id
    const { rows } = await resolvedPool.query(
      `SELECT * FROM users WHERE LOWER(login) = LOWER($1) LIMIT 1`,
      [trimmed]
    );
    if (rows.length) return subscriberFromRow(rows[0]);
    const nid = normalizeId(trimmed);
    if (nid != null) {
      const { rows: byId } = await resolvedPool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [nid]);
      if (byId.length) return subscriberFromRow(byId[0]);
    }
    return null;
  };

  const upsertSubscriber = async (record) => {
    await ensure();
    const ts = toSqlTimestamps(record);
    const login = String(record.login || record.name || '').trim() || `user_${Date.now()}`;
    const name = String(record.name || '').trim() || login;
    const passwordHash = record.passwordHash || '';
    const avatarUrl = record.avatarUrl || null;
    const role = record.role || 'user';

    const existingId = normalizeId(record.id);
    if (existingId != null) {
    const { rows } = await resolvedPool.query(
      `UPDATE users SET name = $2,
         password_hash = CASE WHEN $3 IS NOT NULL AND $3 <> '' THEN $3 ELSE password_hash END,
         avatar_url = COALESCE($4, avatar_url), role = $5, updated_at = $6
         WHERE id = $1 RETURNING *`,
      [existingId, name, passwordHash, avatarUrl, role, ts.updated]
    );
      if (rows.length) return subscriberFromRow(rows[0]);
    }

    const { rows } = await resolvedPool.query(
      `INSERT INTO users (login, name, password_hash, avatar_url, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (login) DO UPDATE SET name = EXCLUDED.name,
         password_hash = CASE WHEN EXCLUDED.password_hash IS NOT NULL AND EXCLUDED.password_hash <> '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
         avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url), updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [login, name, passwordHash, avatarUrl, role, ts.created, ts.updated]
    );
    return subscriberFromRow(rows[0]);
  };

  const insertSubscriber = async (record) => {
    await ensure();
    const ts = toSqlTimestamps(record);
    const login = String(record.login || '').trim();
    const name = String(record.name || '').trim();
    const passwordHash = record.passwordHash || '';
    const avatarUrl = record.avatarUrl || null;
    const role = record.role || 'user';
    if (!login || !name) throw new Error('login и name обязательны');
    const { rows } = await resolvedPool.query(
      `INSERT INTO users (login, name, password_hash, avatar_url, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [login, name, passwordHash, avatarUrl, role, ts.created, ts.updated]
    );
    return subscriberFromRow(rows[0]);
  };

  const insertCall = async (record) => {
    await ensure();
    const ts = toSqlTimestamps(record);
    const fromId = normalizeId(record.from?.id);
    const toId = normalizeId(record.to?.id);
    if (fromId == null || toId == null) throw new Error('from.id и to.id обязательны');
    const { rows } = await resolvedPool.query(
      `INSERT INTO calls (from_id, from_name, to_id, to_name, call_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        fromId,
        record.from?.name || '',
        toId,
        record.to?.name || '',
        record.callType || 'audio',
        record.status || 'pending',
        ts.created,
        ts.updated,
      ]
    );
    const r = rows[0];
    return {
      id: String(r.id),
      from: { id: String(r.from_id), name: r.from_name },
      to: { id: String(r.to_id), name: r.to_name },
      callType: r.call_type,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      status: r.status,
    };
  };

  const getCallById = async (callId) => {
    const nid = normalizeId(callId);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(`SELECT * FROM calls WHERE id = $1 LIMIT 1`, [nid]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      from: { id: String(r.from_id), name: r.from_name },
      to: { id: String(r.to_id), name: r.to_name },
      callType: r.call_type,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      status: r.status,
    };
  };

  const listPendingCalls = async (subscriberId) => {
    const nid = normalizeId(subscriberId);
    if (nid == null) return [];
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM calls WHERE to_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
      [nid]
    );
    return rows.map((r) => ({
      id: String(r.id),
      from: { id: String(r.from_id), name: r.from_name },
      to: { id: String(r.to_id), name: r.to_name },
      callType: r.call_type,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      status: r.status,
    }));
  };

  const updateCallStatus = async (callId, status, updatedAt = Date.now()) => {
    const nid = normalizeId(callId);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(
      `UPDATE calls SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
      [nid, status, updatedAt]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      from: { id: String(r.from_id), name: r.from_name },
      to: { id: String(r.to_id), name: r.to_name },
      callType: r.call_type,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      status: r.status,
    };
  };

  const deleteOldNonPendingCalls = async (thresholdTimestamp) => {
    await ensure();
    await resolvedPool.query(
      `DELETE FROM calls WHERE status <> 'pending' AND COALESCE(updated_at, created_at) < $1`,
      [thresholdTimestamp]
    );
  };

  const listContacts = async (ownerId) => {
    const nid = normalizeId(ownerId);
    if (nid == null) return [];
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT owner_id, contact_id, created_at FROM contacts WHERE owner_id = $1 ORDER BY created_at ASC`,
      [nid]
    );
    return rows.map((r) => ({
      ownerId: String(r.owner_id),
      contactId: String(r.contact_id),
      createdAt: Number(r.created_at),
    }));
  };

  const addContact = async (ownerId, contactId) => {
    const oid = normalizeId(ownerId);
    const cid = normalizeId(contactId);
    if (oid == null || cid == null) return;
    await ensure();
    await resolvedPool.query(
      `INSERT INTO contacts (owner_id, contact_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (owner_id, contact_id) DO NOTHING`,
      [oid, cid, Date.now()]
    );
  };

  const removeContact = async (ownerId, contactId) => {
    const oid = normalizeId(ownerId);
    const cid = normalizeId(contactId);
    if (oid == null || cid == null) return;
    await ensure();
    await resolvedPool.query(`DELETE FROM contacts WHERE owner_id = $1 AND contact_id = $2`, [oid, cid]);
  };

  const listMessages = async (fromId, toId) => {
    const fid = normalizeId(fromId);
    const tid = normalizeId(toId);
    if (fid == null || tid == null) return [];
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT id, from_id, to_id, body, created_at FROM chat_messages
       WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1) ORDER BY created_at ASC`,
      [fid, tid]
    );
    return rows.map((r) => ({
      id: String(r.id),
      fromId: String(r.from_id),
      toId: String(r.to_id),
      body: r.body,
      createdAt: Number(r.created_at),
    }));
  };

  const insertMessage = async (record) => {
    await ensure();
    const fromId = normalizeId(record.fromId);
    const toId = normalizeId(record.toId);
    if (fromId == null || toId == null) throw new Error('fromId и toId обязательны');
    const { rows } = await resolvedPool.query(
      `INSERT INTO chat_messages (from_id, to_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
      [fromId, toId, record.body, record.createdAt || Date.now()]
    );
    return {
      id: String(rows[0].id),
      fromId: String(fromId),
      toId: String(toId),
      body: record.body,
      createdAt: record.createdAt || Date.now(),
    };
  };

  const listContactRequests = async (subscriberId) => {
    const nid = normalizeId(subscriberId);
    if (nid == null) return [];
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM contact_requests WHERE to_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
      [nid]
    );
    return rows.map((r) => ({
      id: String(r.id),
      fromId: String(r.from_id),
      fromName: r.from_name,
      toId: String(r.to_id),
      toName: r.to_name,
      status: r.status,
      createdAt: Number(r.created_at),
      updatedAt: r.updated_at ? Number(r.updated_at) : null,
    }));
  };

  const listOutgoingContactRequests = async (subscriberId) => {
    const nid = normalizeId(subscriberId);
    if (nid == null) return [];
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT * FROM contact_requests WHERE from_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
      [nid]
    );
    return rows.map((r) => ({
      id: String(r.id),
      fromId: String(r.from_id),
      fromName: r.from_name,
      toId: String(r.to_id),
      toName: r.to_name,
      status: r.status,
      createdAt: Number(r.created_at),
      updatedAt: r.updated_at ? Number(r.updated_at) : null,
    }));
  };

  const createContactRequest = async (record) => {
    await ensure();
    const fromId = normalizeId(record.fromId);
    const toId = normalizeId(record.toId);
    if (fromId == null || toId == null) throw new Error('fromId и toId обязательны');
    const { rows: existing } = await resolvedPool.query(
      `SELECT * FROM contact_requests WHERE from_id = $1 AND to_id = $2 AND status = 'pending' LIMIT 1`,
      [fromId, toId]
    );
    if (existing.length) {
      const r = existing[0];
      return {
        id: String(r.id),
        fromId: String(r.from_id),
        fromName: r.from_name,
        toId: String(r.to_id),
        toName: r.to_name,
        status: r.status,
        createdAt: Number(r.created_at),
      };
    }
    const { rows } = await resolvedPool.query(
      `INSERT INTO contact_requests (from_id, from_name, to_id, to_name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [fromId, record.fromName, toId, record.toName, record.status || 'pending', record.createdAt || Date.now()]
    );
    const r = rows[0];
    return {
      id: String(r.id),
      fromId: String(r.from_id),
      fromName: r.from_name,
      toId: String(r.to_id),
      toName: r.to_name,
      status: r.status,
      createdAt: Number(r.created_at),
    };
  };

  const getContactRequestById = async (requestId) => {
    const nid = normalizeId(requestId);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(`SELECT * FROM contact_requests WHERE id = $1 LIMIT 1`, [nid]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      fromId: String(r.from_id),
      fromName: r.from_name,
      toId: String(r.to_id),
      toName: r.to_name,
      status: r.status,
      createdAt: Number(r.created_at),
      updatedAt: r.updated_at ? Number(r.updated_at) : null,
    };
  };

  const getSetting = async (key) => {
    await ensure();
    const { rows } = await resolvedPool.query(`SELECT value FROM app_settings WHERE key = $1 LIMIT 1`, [key]);
    return rows.length ? rows[0].value : null;
  };

  const setSetting = async (key, value) => {
    await ensure();
    await resolvedPool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, String(value)]
    );
  };

  const savePushSubscription = async (subscriberId, subscription) => {
    const nid = normalizeId(subscriberId);
    if (nid == null || !subscription?.endpoint || !subscription?.keys) return;
    await ensure();
    const keys = subscription.keys || {};
    await resolvedPool.query(
      `INSERT INTO push_subscriptions (subscriber_id, endpoint, p256dh, auth, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (subscriber_id) DO UPDATE SET endpoint = $2, p256dh = $3, auth = $4, updated_at = $5`,
      [nid, subscription.endpoint, keys.p256dh || '', keys.auth || '', Date.now()]
    );
  };

  const getPushSubscription = async (subscriberId) => {
    const nid = normalizeId(subscriberId);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE subscriber_id = $1 LIMIT 1`,
      [nid]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
    };
  };

  const updateContactRequestStatus = async (requestId, status) => {
    const nid = normalizeId(requestId);
    if (nid == null) return null;
    await ensure();
    const { rows } = await resolvedPool.query(
      `UPDATE contact_requests SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
      [nid, status, Date.now()]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      fromId: String(r.from_id),
      fromName: r.from_name,
      toId: String(r.to_id),
      toName: r.to_name,
      status: r.status,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  };

  return {
    listSubscribers,
    getSubscriberById,
    getSubscriberByLogin,
    upsertSubscriber,
    insertSubscriber,
    insertCall,
    listPendingCalls,
    updateCallStatus,
    deleteOldNonPendingCalls,
    listContacts,
    addContact,
    removeContact,
    listMessages,
    insertMessage,
    listContactRequests,
    listOutgoingContactRequests,
    createContactRequest,
    getContactRequestById,
    updateContactRequestStatus,
    savePushSubscription,
    getPushSubscription,
    getSetting,
    setSetting,
    close: () => (resolvedPool?.end ? resolvedPool.end() : Promise.resolve()),
  };
}

export default createPostgresAdapter;
