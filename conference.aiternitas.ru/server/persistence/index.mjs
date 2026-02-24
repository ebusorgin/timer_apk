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

  const factory = adapterFactory || createPostgresAdapter;
  const adapter = factory({
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

  const listSubscribers = async () => {
    const raw = await adapter.listSubscribers();
    const { records, invalid } = validateSubscribers(raw, { strict: false });
    logInvalid(logger, 'подписчики', invalid);
    return sortSubscribers(records);
  };

  const listSubscribersPaged = async (offset = 0, limit = 50) => {
    const { items, total } = await adapter.listSubscribersPaged(offset, limit);
    const { records, invalid } = validateSubscribers(items, { strict: false });
    logInvalid(logger, 'подписчики (пагинация)', invalid);
    return { items: records, total };
  };

  const getSubscriberById = async (subscriberId) => {
    if (subscriberId == null || subscriberId === '') return null;
    return adapter.getSubscriberById(subscriberId);
  };

  const getSubscriberByLogin = async (login) => {
    return adapter.getSubscriberByLogin(login);
  };

  const upsertSubscriber = async (record) => {
    return adapter.upsertSubscriber(record);
  };

  const insertSubscriber = async (record) => {
    return adapter.insertSubscriber(record);
  };

  const deleteSubscriber = async (subscriberId) => {
    return adapter.deleteSubscriber(subscriberId);
  };

  const getCallById = async (callId) => {
    return adapter.getCallById(callId);
  };

  const listPendingCalls = async (subscriberId) => {
    if (!subscriberId) return [];
    return adapter.listPendingCalls(subscriberId);
  };

  const createCall = async (payload) => {
    const { records: [record] } = validateCalls([payload], { strict: true });
    return adapter.insertCall(record);
  };

  const updateCallStatus = async (callId, status) => {
    if (!callId || !CALL_STATUS_SET.has(status)) return null;
    return adapter.updateCallStatus(callId, status, Date.now());
  };

  const cleanupCalls = async (thresholdTimestamp = Date.now() - 60 * 60 * 1000) => {
    await adapter.deleteOldNonPendingCalls(thresholdTimestamp);
  };

  const listContacts = async (ownerId) => {
    return adapter.listContacts(ownerId);
  };

  const addContact = async (ownerId, contactId) => {
    await adapter.addContact(ownerId, contactId);
  };

  const removeContact = async (ownerId, contactId) => {
    await adapter.removeContact(ownerId, contactId);
  };

  const listMessages = async (fromId, toId) => {
    return adapter.listMessages(fromId, toId);
  };

  const insertMessage = async (record) => {
    const candidate = {
      id: record.id,
      fromId: record.fromId,
      toId: record.toId,
      body: record.body,
      createdAt: record.createdAt ?? Date.now(),
    };
    const { records: [validated] } = validateChatMessages([candidate], { strict: true });
    return adapter.insertMessage(validated);
  };

  const listContactRequests = async (subscriberId) => {
    return adapter.listContactRequests(subscriberId);
  };

  const listOutgoingContactRequests = async (subscriberId) => {
    return adapter.listOutgoingContactRequests(subscriberId);
  };

  const createContactRequest = async (record) => {
    return adapter.createContactRequest(record);
  };

  const getContactRequestById = async (requestId) => {
    return adapter.getContactRequestById(requestId);
  };

  const updateContactRequestStatus = async (requestId, status) => {
    return adapter.updateContactRequestStatus(requestId, status);
  };

  const getSetting = async (key) => {
    return adapter.getSetting(key);
  };

  const setSetting = async (key, value) => {
    await adapter.setSetting(key, value);
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
    return adapter.savePushSubscription(subscriberId, subscription);
  };

  const getPushSubscription = async (subscriberId) => {
    return adapter.getPushSubscription(subscriberId);
  };

  const saveFcmToken = async (subscriberId, token) => {
    await adapter.saveFcmToken(subscriberId, token);
  };

  const getFcmToken = async (subscriberId) => {
    return adapter.getFcmToken(subscriberId);
  };

  const isAdmin = async (subscriberId) => {
    const sub = await getSubscriberById(subscriberId);
    return !!(sub && (sub.role === 'admin' || sub.isAdmin));
  };

  return {
    adapter,
    listSubscribers,
    listSubscribersPaged,
    getSubscriberById,
    getSubscriberByLogin,
    upsertSubscriber,
    insertSubscriber,
    deleteSubscriber,
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
    getSetting,
    setSetting,
    getJwtTtlSeconds,
    setJwtTtlSeconds,
    savePushSubscription,
    getPushSubscription,
    saveFcmToken,
    getFcmToken,
    isAdmin,
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
