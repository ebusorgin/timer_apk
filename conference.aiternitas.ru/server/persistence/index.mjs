import createFileAdapter from './fileAdapter.mjs';
import createPostgresAdapter from './postgresAdapter.mjs';
import {
  validateSubscribers,
  validateUsers,
  validateCalls,
  validateContacts,
  validateChatMessages,
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
    if (subscriberId == null || subscriberId === '') return null;
    if (typeof adapter.getSubscriberById === 'function') {
      const raw = await adapter.getSubscriberById(subscriberId);
      return raw || null;
    }
    const subscribers = await readSubscribers();
    const sid = String(subscriberId);
    return subscribers.find((item) => String(item.id) === sid) || null;
  };

  const getSubscriberByLogin = async (login) => {
    if (typeof adapter.getSubscriberByLogin === 'function') {
      return adapter.getSubscriberByLogin(login) || null;
    }
    const subscribers = await readSubscribers();
    return subscribers.find((s) => (s.login || '').trim() === String(login).trim()) || null;
  };

  const syncUserRecord = async () => {
    // Legacy: users table removed, subscribers is the single source
  };

  const upsertSubscriber = async (record) => {
    if (typeof adapter.upsertSubscriber === 'function') {
      return adapter.upsertSubscriber(record);
    }
    const subscribers = await readSubscribers();
    const { records: [validated] } = validateSubscribers([record], { strict: true });
    const idx = subscribers.findIndex((s) => String(s.id) === String(record.id));
    const now = Date.now();
    const item = {
      ...validated,
      createdAt: idx >= 0 ? subscribers[idx].createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) subscribers[idx] = item;
    else subscribers.push(item);
    await adapter.write('subscribers', sortSubscribers(subscribers));
    return subscribers.find((s) => String(s.id) === String(record.id)) || item;
  };

  const insertSubscriber = async (record) => {
    if (typeof adapter.insertSubscriber === 'function') {
      return adapter.insertSubscriber(record);
    }
    return upsertSubscriber(record);
  };

  const getCallById = async (callId) => {
    if (typeof adapter.getCallById === 'function') return adapter.getCallById(callId);
    const calls = await readCalls();
    return (calls || []).find((c) => String(c.id) === String(callId)) || null;
  };

  const listPendingCalls = async (subscriberId) => {
    if (!subscriberId) return [];
    if (typeof adapter.listPendingCalls === 'function') {
      return adapter.listPendingCalls(subscriberId);
    }
    const calls = await readCalls();
    const sid = String(subscriberId);
    return calls
      .filter((c) => String(c?.to?.id) === sid && c.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const createCall = async (payload) => {
    const { records: [record] } = validateCalls([payload], { strict: true });
    if (typeof adapter.insertCall === 'function') {
      return adapter.insertCall(record);
    }
    const calls = await readCalls();
    const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 10);
    const full = { ...record, id };
    calls.push(full);
    await adapter.write('calls', calls);
    return full;
  };

  const updateCallStatus = async (callId, status) => {
    if (!callId || !CALL_STATUS_SET.has(status)) return null;
    if (typeof adapter.updateCallStatus === 'function') {
      return adapter.updateCallStatus(callId, status, Date.now());
    }
    const calls = await readCalls();
    const idx = calls.findIndex((c) => String(c.id) === String(callId));
    if (idx === -1) return null;
    calls[idx] = { ...calls[idx], status, updatedAt: Date.now() };
    const cleaned = calls.filter((c) => c.status === 'pending' || Date.now() - (c.updatedAt || c.createdAt || 0) < 3600000);
    if (cleaned.length !== calls.length) await adapter.write('calls', cleaned);
    return calls[idx];
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

  const listContacts = async (ownerId) => {
    if (typeof adapter.listContacts === 'function') {
      return adapter.listContacts(ownerId);
    }
    const raw = await adapter.read('contacts');
    const { records } = validateContacts(raw, { strict: false });
    return records
      .filter((c) => (c.ownerId || c.owner_id) === ownerId)
      .sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0));
  };

  const addContact = async (ownerId, contactId) => {
    if (typeof adapter.addContact === 'function') {
      await adapter.addContact(ownerId, contactId);
      return;
    }
    const raw = await adapter.read('contacts');
    const { records } = validateContacts(raw, { strict: false });
    const exists = records.some(
      (c) => (c.ownerId || c.owner_id) === ownerId && (c.contactId || c.contact_id) === contactId
    );
    if (!exists) {
      records.push({
        ownerId,
        contactId,
        createdAt: Date.now(),
      });
      await adapter.write('contacts', records);
    }
  };

  const removeContact = async (ownerId, contactId) => {
    if (typeof adapter.removeContact === 'function') {
      await adapter.removeContact(ownerId, contactId);
      return;
    }
    const raw = await adapter.read('contacts');
    const { records } = validateContacts(raw, { strict: false });
    const filtered = records.filter(
      (c) => !((c.ownerId || c.owner_id) === ownerId && (c.contactId || c.contact_id) === contactId)
    );
    if (filtered.length !== records.length) {
      await adapter.write('contacts', filtered);
    }
  };

  const listMessages = async (fromId, toId) => {
    if (typeof adapter.listMessages === 'function') {
      return adapter.listMessages(fromId, toId);
    }
    const raw = await adapter.read('chat_messages');
    const { records } = validateChatMessages(raw, { strict: false });
    return records
      .filter(
        (m) =>
          ((m.fromId || m.from_id) === fromId && (m.toId || m.to_id) === toId) ||
          ((m.fromId || m.from_id) === toId && (m.toId || m.to_id) === fromId)
      )
      .sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0));
  };

  const insertMessage = async (record) => {
    const candidate = {
      id: record.id,
      fromId: record.fromId,
      toId: record.toId,
      body: record.body,
      createdAt: record.createdAt ?? Date.now(),
    };
    const {
      records: [validated],
    } = validateChatMessages([candidate], { strict: true });
    if (typeof adapter.insertMessage === 'function') {
      await adapter.insertMessage(validated);
      return validated;
    }
    const raw = await adapter.read('chat_messages');
    const { records } = validateChatMessages(raw, { strict: false });
    records.push(validated);
    await adapter.write('chat_messages', records);
    return validated;
  };

  // --- Contact Requests ---
  const listContactRequests = async (subscriberId) => {
    if (typeof adapter.listContactRequests === 'function') {
      return adapter.listContactRequests(subscriberId);
    }
    const raw = await adapter.read('contact_requests');
    return (raw || [])
      .filter((r) => r.toId === subscriberId && r.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const listOutgoingContactRequests = async (subscriberId) => {
    if (typeof adapter.listOutgoingContactRequests === 'function') {
      return adapter.listOutgoingContactRequests(subscriberId);
    }
    const raw = await adapter.read('contact_requests');
    return (raw || [])
      .filter((r) => r.fromId === subscriberId && r.status === 'pending')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  const createContactRequest = async (record) => {
    if (typeof adapter.createContactRequest === 'function') {
      return adapter.createContactRequest(record);
    }
    const raw = await adapter.read('contact_requests');
    const items = raw || [];
    const existing = items.find(
      (r) => r.fromId === record.fromId && r.toId === record.toId && r.status === 'pending'
    );
    if (existing) return existing;
    items.push(record);
    await adapter.write('contact_requests', items);
    return record;
  };

  const getContactRequestById = async (requestId) => {
    if (typeof adapter.getContactRequestById === 'function') {
      return adapter.getContactRequestById(requestId);
    }
    const raw = await adapter.read('contact_requests');
    return (raw || []).find((r) => r.id === requestId) || null;
  };

  const updateContactRequestStatus = async (requestId, status) => {
    if (typeof adapter.updateContactRequestStatus === 'function') {
      return adapter.updateContactRequestStatus(requestId, status);
    }
    const raw = await adapter.read('contact_requests');
    const items = raw || [];
    const idx = items.findIndex((r) => r.id === requestId);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], status, updatedAt: Date.now() };
    await adapter.write('contact_requests', items);
    return items[idx];
  };

  const getSetting = async (key) => {
    if (typeof adapter.getSetting === 'function') return adapter.getSetting(key);
    return null;
  };

  const setSetting = async (key, value) => {
    if (typeof adapter.setSetting === 'function') await adapter.setSetting(key, value);
  };

  const getJwtTtlSeconds = async () => {
    const v = await getSetting('jwt_ttl_seconds');
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 86400;
  };

  const setJwtTtlSeconds = async (sec) => {
    await setSetting('jwt_ttl_seconds', String(Math.max(60, Math.min(31536000, sec))));
  };

  const savePushSubscription = async (subscriberId, subscription) => {
    if (typeof adapter.savePushSubscription === 'function') {
      return adapter.savePushSubscription(subscriberId, subscription);
    }
    return null;
  };

  const getPushSubscription = async (subscriberId) => {
    if (typeof adapter.getPushSubscription === 'function') {
      return adapter.getPushSubscription(subscriberId);
    }
    return null;
  };

  const isAdmin = async (subscriberId) => {
    const sub = await getSubscriberById(subscriberId);
    return !!(sub && (sub.role === 'admin' || sub.isAdmin));
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
    getCallById,
    listPendingCalls,
    createCall,
    updateCallStatus,
    cleanupCalls,
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
    getSubscriberByLogin,
    insertSubscriber,
    isAdmin,
    getSetting,
    setSetting,
    getJwtTtlSeconds,
    setJwtTtlSeconds,
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

