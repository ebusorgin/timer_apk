import { sanitizeDisplayName } from '../utils/subscriberUtils.mjs';

export const CALL_STATUS_VALUES = ['pending', 'acknowledged', 'accepted', 'declined', 'ignored', 'cancelled'];
export const CALL_STATUS_SET = new Set(CALL_STATUS_VALUES);
export const CALL_TYPE_VALUES = ['audio', 'video'];
export const CALL_TYPE_SET = new Set(CALL_TYPE_VALUES);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const coerceString = (value) => (typeof value === 'string' ? value.trim() : '');
const coerceTimestamp = (value, fallback) =>
  Number.isFinite(value) && typeof value === 'number' ? value : fallback;

const buildValidationError = (message, payload) => {
  const error = new Error(message);
  if (payload) {
    error.details = payload;
  }
  return error;
};

export const validateSubscribers = (items, { strict = false } = {}) => {
  if (!Array.isArray(items)) {
    if (strict) {
      throw buildValidationError('Список подписчиков должен быть массивом.');
    }
    return { records: [], invalid: [] };
  }

  const invalid = [];
  const records = [];

  items.forEach((candidate, index) => {
    const id = coerceString(candidate?.id);
    const name = sanitizeDisplayName(candidate?.name);
    const createdAt = coerceTimestamp(candidate?.createdAt, Date.now());
    const updatedAt = coerceTimestamp(candidate?.updatedAt, createdAt);

    if (!isNonEmptyString(id) || !isNonEmptyString(name)) {
      invalid.push({ index, reason: 'Некорректный id или имя подписчика.' });
      return;
    }

    const record = { id, name, createdAt, updatedAt };
    if (typeof candidate?.login === 'string' && candidate.login.trim()) record.login = candidate.login.trim();
    if (typeof candidate?.passwordHash === 'string' && candidate.passwordHash.length > 0) record.passwordHash = candidate.passwordHash;
    if (typeof candidate?.avatarUrl === 'string' && candidate.avatarUrl.length > 0) record.avatarUrl = candidate.avatarUrl;
    if (typeof candidate?.role === 'string' && candidate.role.trim()) record.role = candidate.role.trim();
    records.push(record);
  });

  if (strict && invalid.length) {
    throw buildValidationError('Обнаружены некорректные записи подписчиков.', { invalid });
  }

  return { records, invalid };
};

const normalizeParticipant = (participant, role) => {
  const id = coerceString(participant?.id);
  const name = sanitizeDisplayName(participant?.name) || 'Неизвестный';

  if (!isNonEmptyString(id)) {
    return { invalid: true, reason: `Некорректный идентификатор участника (${role}).` };
  }

  return {
    record: {
      id,
      name,
    },
    invalid: false,
  };
};

export const validateCalls = (items, { strict = false } = {}) => {
  if (!Array.isArray(items)) {
    if (strict) {
      throw buildValidationError('Список звонков должен быть массивом.');
    }
    return { records: [], invalid: [] };
  }

  const invalid = [];
  const records = [];

  items.forEach((candidate, index) => {
    const id = coerceString(candidate?.id);
    const createdAtFallback = Date.now();
    const createdAt = coerceTimestamp(candidate?.createdAt, createdAtFallback);
    const updatedAt = coerceTimestamp(candidate?.updatedAt, createdAt);
    const status = CALL_STATUS_SET.has(candidate?.status)
      ? candidate.status
      : 'pending';

    const fromParticipant = normalizeParticipant(candidate?.from, 'from');
    const toParticipant = normalizeParticipant(candidate?.to, 'to');

    if (!isNonEmptyString(id) || fromParticipant.invalid || toParticipant.invalid) {
      invalid.push({
        index,
        reason: fromParticipant.reason || toParticipant.reason || 'Некорректные данные звонка.',
      });
      return;
    }

    const callType = CALL_TYPE_SET.has(candidate?.callType) ? candidate.callType : 'audio';

    records.push({
      id,
      from: fromParticipant.record,
      to: toParticipant.record,
      callType,
      createdAt,
      updatedAt,
      status,
    });
  });

  if (strict && invalid.length) {
    throw buildValidationError('Обнаружены некорректные записи звонков.', { invalid });
  }

  return { records, invalid };
};

export const validateUsers = (items, options = {}) => validateSubscribers(items, options);

export const validateContacts = (items, { strict = false } = {}) => {
  if (!Array.isArray(items)) {
    if (strict) {
      throw buildValidationError('Список контактов должен быть массивом.');
    }
    return { records: [], invalid: [] };
  }
  const invalid = [];
  const records = [];
  items.forEach((candidate, index) => {
    const ownerId = coerceString(candidate?.ownerId ?? candidate?.owner_id);
    const contactId = coerceString(candidate?.contactId ?? candidate?.contact_id);
    const createdAt = coerceTimestamp(candidate?.createdAt ?? candidate?.created_at, Date.now());
    if (!isNonEmptyString(ownerId) || !isNonEmptyString(contactId)) {
      invalid.push({ index, reason: 'Некорректный ownerId или contactId.' });
      return;
    }
    records.push({ ownerId, contactId, createdAt });
  });
  if (strict && invalid.length) {
    throw buildValidationError('Обнаружены некорректные записи контактов.', { invalid });
  }
  return { records, invalid };
};

export const validateChatMessages = (items, { strict = false } = {}) => {
  if (!Array.isArray(items)) {
    if (strict) {
      throw buildValidationError('Список сообщений должен быть массивом.');
    }
    return { records: [], invalid: [] };
  }
  const invalid = [];
  const records = [];
  items.forEach((candidate, index) => {
    const id = coerceString(candidate?.id);
    const fromId = coerceString(candidate?.fromId ?? candidate?.from_id);
    const toId = coerceString(candidate?.toId ?? candidate?.to_id);
    const body = coerceString(candidate?.body);
    const createdAt = coerceTimestamp(candidate?.createdAt ?? candidate?.created_at, Date.now());
    if (!isNonEmptyString(id) || !isNonEmptyString(fromId) || !isNonEmptyString(toId) || body === '') {
      invalid.push({ index, reason: 'Некорректные данные сообщения.' });
      return;
    }
    records.push({ id, fromId, toId, body, createdAt });
  });
  if (strict && invalid.length) {
    throw buildValidationError('Обнаружены некорректные записи сообщений.', { invalid });
  }
  return { records, invalid };
};

export default {
  validateSubscribers,
  validateUsers,
  validateCalls,
  validateContacts,
  validateChatMessages,
  CALL_STATUS_VALUES,
  CALL_STATUS_SET,
  CALL_TYPE_VALUES,
  CALL_TYPE_SET,
};

