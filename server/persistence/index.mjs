import createFileAdapter from './fileAdapter.mjs';
import createPostgresAdapter from './postgresAdapter.mjs';
import {
  validateSubscribers,
  validateUsers,
  validateCalls,
  CALL_STATUS_SET,
  CALL_STATUS_VALUES,
} from './validators.mjs';

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
    await adapter.write('calls', records);
  };

  return {
    adapter,
    readSubscribers,
    writeSubscribers,
    readUsers,
    writeUsers,
    readCalls,
    writeCalls,
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

