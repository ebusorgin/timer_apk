import createFileAdapter from './fileAdapter.mjs';
import createPostgresAdapter from './postgresAdapter.mjs';
import {
  validateSubscribers,
  validateUsers,
  validateCalls,
  CALL_STATUS_SET,
  CALL_STATUS_VALUES,
} from './validators.mjs';
import { sortSubscribers } from '../utils/subscriberUtils.mjs';

const logInvalid = (logger, label, invalid = []) => {
  if (!invalid.length) {
    return;
  }
  (logger?.warn || console.warn)(
    `⚠️ Пропущено ${invalid.length} некорректных записей (${label}).`,
    invalid,
  );
};

export function createPersistence(paths = {}, options = {}) {
  const {
    backupDir,
    enableBackups = true,
    driver = 'file',
    connectionString,
    adapterFactory,
    logger = console,
    pool,
    poolInstance,
    poolConfig,
    schema,
    tables,
    ssl,
    statementTimeout,
  } = options;

  const hasConnectionString =
    typeof connectionString === 'string' && connectionString.length > 0;
  const normalizedDriver = (() => {
    if (typeof driver === 'string') {
      const lowered = driver.toLowerCase();
      if (lowered === 'postgres' || lowered === 'file') {
        return lowered;
      }
    }
    return hasConnectionString ? 'postgres' : 'file';
  })();

  let adapter;

  if (normalizedDriver === 'postgres') {
    const factory = adapterFactory || createPostgresAdapter;
    adapter = factory({
      connectionString,
      logger,
      pool,
      poolInstance,
      poolConfig,
      schema,
      tables,
      ssl,
      statementTimeout,
    });
  } else {
    const factory = adapterFactory || createFileAdapter;
    adapter = factory({
      ...paths,
      backupDir,
      enableBackups,
      logger,
    });
  }

  const readSubscribers = async () => {
    const raw = await adapter.read('subscribers');
    const { records, invalid } = validateSubscribers(raw, { strict: false });
    logInvalid(logger, 'подписчики', invalid);
    return records;
  };

  const writeSubscribers = async (items = []) => {
    const { records } = validateSubscribers(items, { strict: true });
    if (typeof adapter.upsertSubscriber === 'function' && records.length === 1) {
      await adapter.upsertSubscriber(records[0]);
      return;
    }
    await adapter.write('subscribers', records);
  };

  const readUsers = async () => {
    const raw = await adapter.read('users');
    const { records, invalid } = validateUsers(raw, { strict: false });
    logInvalid(logger, 'пользователи', invalid);
    return records;
  };

  const writeUsers = async (items = []) => {
    const { records } = validateUsers(items, { strict: true });
    if (typeof adapter.replaceUsers === 'function') {
      await adapter.replaceUsers(records);
      return;
    }
    if (typeof adapter.upsertUser === 'function' && records.length === 1) {
      await adapter.upsertUser(records[0]);
      return;
    }
    await adapter.write('users', records);
  };

  const readCalls = async () => {
    const raw = await adapter.read('calls');
    const { records, invalid } = validateCalls(raw, { strict: false });
    logInvalid(logger, 'звонки', invalid);
    return records;
  };

  const writeCalls = async (items = []) => {
    const { records } = validateCalls(items, { strict: true });
    if (typeof adapter.insertCall === 'function' && records.length === 1) {
      await adapter.insertCall(records[0]);
      return;
    }
    await adapter.write('calls', records);
  };

  const listSubscribers = async () => {
    if (typeof adapter.listSubscribers === 'function') {
      const raw = await adapter.listSubscribers();
      const { records, invalid } = validateSubscribers(raw, { strict: false });
      logInvalid(logger, 'подписчики', invalid);
      return sortSubscribers(records);
    }
    return sortSubscribers(await readSubscribers());
  };

  const getSubscriberById = async (subscriberId) => {
    if (!subscriberId) {
      return null;
    }
    if (typeof adapter.getSubscriberById === 'function') {
      const raw = await adapter.getSubscriberById(subscriberId);
      if (!raw) {
        return null;
      }
      const { records } = validateSubscribers([raw], { strict: false });
      return records[0] || null;
    }
    const subscribers = await readSubscribers();
    return subscribers.find((item) => item.id === subscriberId) || null;
  };

  const syncUserRecord = async (record) => {
    if (!record) {
      return;
    }
    try {
      await writeUsers([record]);
    } catch (error) {
      logger?.warn?.('Не удалось синхронизировать запись пользователя', {
        error: error?.message || error,
        userId: record.id,
      });
    }
  };

  const upsertSubscriber = async ({ id, name }) => {
    const existing = await getSubscriberById(id);
    const now = Date.now();
    const candidate = {
      id,
      name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const {
      records: [record],
    } = validateSubscribers([candidate], { strict: true });

    if (typeof adapter.upsertSubscriber === 'function') {
      const saved = await adapter.upsertSubscriber(record);
      const {
        records: [normalized],
      } = validateSubscribers([saved], { strict: false });
      await syncUserRecord(normalized);
      return normalized;
    }

    const subscribers = await readSubscribers();
    const index = subscribers.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      subscribers[index] = {
        ...subscribers[index],
        ...record,
        updatedAt: record.updatedAt,
      };
    } else {
      subscribers.push(record);
    }

    const ordered = sortSubscribers(subscribers);
    await adapter.write('subscribers', ordered);
    await syncUserRecord(record);
    return ordered.find((item) => item.id === record.id) || record;
  };

  const listPendingCalls = async (subscriberId) => {
    if (!subscriberId) {
      return [];
    }

    if (typeof adapter.listPendingCalls === 'function') {
      const raw = await adapter.listPendingCalls(subscriberId);
      const { records } = validateCalls(raw, { strict: false });
      return records
        .filter((call) => call?.to?.id === subscriberId && call.status === 'pending')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }

    const calls = await readCalls();
    return calls
      .filter((call) => call?.to?.id === subscriberId && call.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const createCall = async (payload) => {
    const {
      records: [record],
    } = validateCalls([payload], { strict: true });

    if (typeof adapter.insertCall === 'function') {
      const stored = await adapter.insertCall(record);
      const {
        records: [normalized],
      } = validateCalls([stored], { strict: false });
      return normalized;
    }

    const calls = await readCalls();
    calls.push(record);
    await adapter.write('calls', calls);
    return record;
  };

  const updateCallStatus = async (callId, status) => {
    if (!callId || !CALL_STATUS_SET.has(status)) {
      return null;
    }

    if (typeof adapter.updateCallStatus === 'function') {
      const updated = await adapter.updateCallStatus(callId, status, Date.now());
      if (!updated) {
        return null;
      }
      const {
        records: [normalized],
      } = validateCalls([updated], { strict: false });
      return normalized;
    }

    const calls = await readCalls();
    const index = calls.findIndex((call) => call.id === callId);
    if (index === -1) {
      return null;
    }
    calls[index] = {
      ...calls[index],
      status,
      updatedAt: Date.now(),
    };
    const cleaned = calls.filter((call) => {
      if (call.status === 'pending') {
        return true;
      }
      return Date.now() - (call.updatedAt || call.createdAt || 0) < 60 * 60 * 1000;
    });
    await adapter.write('calls', cleaned);
    return calls[index];
  };

  const cleanupCalls = async (thresholdTimestamp = Date.now() - 60 * 60 * 1000) => {
    if (typeof adapter.deleteOldNonPendingCalls === 'function') {
      await adapter.deleteOldNonPendingCalls(thresholdTimestamp);
      return;
    }
    const calls = await readCalls();
    const filtered = calls.filter((call) => {
      if (call.status === 'pending') {
        return true;
      }
      return (call.updatedAt || call.createdAt || 0) >= thresholdTimestamp;
    });
    if (filtered.length !== calls.length) {
      await adapter.write('calls', filtered);
    }
  };

  return {
    adapter,
    readSubscribers,
    writeSubscribers,
    readUsers,
    writeUsers,
    readCalls,
    writeCalls,
    listSubscribers,
    getSubscriberById,
    upsertSubscriber,
    listPendingCalls,
    createCall,
    updateCallStatus,
    cleanupCalls,
  };
}

export {
  CALL_STATUS_SET,
  CALL_STATUS_VALUES,
  validateSubscribers,
  validateUsers,
  validateCalls,
};

export default createPersistence;

