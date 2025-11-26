import { sanitizeDisplayName } from '../utils/subscriberUtils.mjs';

export const CALL_STATUS_VALUES = ['pending', 'acknowledged', 'accepted', 'declined', 'ignored'];
export const CALL_STATUS_SET = new Set(CALL_STATUS_VALUES);

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

    records.push({
      id,
      name,
      createdAt,
      updatedAt,
    });
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

    records.push({
      id,
      from: fromParticipant.record,
      to: toParticipant.record,
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

export default {
  validateSubscribers,
  validateUsers,
  validateCalls,
  CALL_STATUS_VALUES,
  CALL_STATUS_SET,
};

