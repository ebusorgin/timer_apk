import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const toPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
};

const normalizeDriver = (driverCandidate, hasConnectionString) => {
  if (typeof driverCandidate === 'string') {
    const lowered = driverCandidate.trim().toLowerCase();
    if (lowered === 'postgres' || lowered === 'file') {
      return lowered;
    }
  }
  return hasConnectionString ? 'postgres' : 'file';
};

const resolveSslConfig = (override) => {
  if (override !== undefined) {
    return override;
  }
  const sslMode = process.env.PGSSLMODE?.toLowerCase();
  if (sslMode === 'require') {
    return { rejectUnauthorized: false };
  }
  if (sslMode === 'disable') {
    return false;
  }
  return undefined;
};

export function createConfig(options = {}) {
  const {
    corsOrigin = process.env.CORS_ORIGIN || '*',
    pingTimeout = 60000,
    pingInterval = 25000,
    transports = ['websocket', 'polling'],
    socketPath = '/socket.io/',
    rootDir = __dirname,
    dataDir = path.join(rootDir, 'data'),
    wwwDir = path.join(rootDir, '..', 'www'),
    backupDir = path.join(dataDir, 'backups'),
    trustProxy = options.trustProxy ?? true,
    persistence: persistenceOverrides = {},
  } = options;

  const envPersistenceDriver = process.env.PERSISTENCE_DRIVER;
  const envDatabaseUrl = process.env.DATABASE_URL;
  const envPoolMax = toPositiveInteger(process.env.PG_POOL_MAX);
  const envIdleTimeout = toPositiveInteger(process.env.PG_POOL_IDLE_TIMEOUT_MS);
  const envStatementTimeout = toPositiveInteger(process.env.PG_STATEMENT_TIMEOUT_MS);

  const persistenceConnection =
    persistenceOverrides.connectionString || envDatabaseUrl || '';
  const persistenceDriver = normalizeDriver(
    persistenceOverrides.driver || envPersistenceDriver,
    Boolean(persistenceConnection),
  );

  const persistencePoolConfig = {
    max: persistenceOverrides.pool?.max ?? envPoolMax,
    idleTimeoutMillis:
      persistenceOverrides.pool?.idleTimeoutMillis ?? envIdleTimeout,
  };

  const persistenceStatementTimeout =
    persistenceOverrides.statementTimeout ?? envStatementTimeout;
  const persistenceSsl = resolveSslConfig(persistenceOverrides.ssl);
  const persistenceBackupsEnabled =
    persistenceOverrides.enableBackups ?? persistenceDriver !== 'postgres';

  return {
    corsOrigin,
    http: {
      trustProxy,
    },
    socket: {
      path: socketPath,
      transports,
      allowEIO3: true,
      pingTimeout,
      pingInterval,
    },
    paths: {
      rootDir,
      www: wwwDir,
      dataDir,
      backupDir,
      subscribersFile: path.join(dataDir, 'subscribers.json'),
      usersFile: path.join(dataDir, 'users.json'),
      callsFile: path.join(dataDir, 'calls.json'),
    },
    persistence: {
      driver: persistenceDriver,
      connectionString: persistenceConnection,
      pool: persistencePoolConfig,
      statementTimeout: persistenceStatementTimeout,
      ssl: persistenceSsl,
      enableBackups: persistenceBackupsEnabled,
    },
  };
}

export default createConfig;

