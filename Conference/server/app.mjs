import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { existsSync } from 'fs';
import createConfig from './config.mjs';
import createPersistence from './persistence/index.mjs';
import registerRoutes from './routes/index.mjs';
import registerSockets from './sockets/index.mjs';
import {
  createRateLimiter,
  createAuthMiddleware,
  createApiNotFoundHandler,
  createErrorResponder,
} from './middleware/index.mjs';
import createLogger from './utils/logger.mjs';
import {
  createMetrics,
  createHttpMetricsMiddleware,
  createMetricsHandler,
} from './services/metrics.mjs';

const toArray = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const toPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

export function createServerApp(options = {}) {
  const {
    configFactory = createConfig,
    persistenceFactory = createPersistence,
    routesRegistrar = registerRoutes,
    socketsRegistrar = registerSockets,
    persistenceOptions = {},
    expressAppFactory = () => express(),
    httpServerFactory = createServer,
    socketServerFactory = (httpServer, socketOptions) => new Server(httpServer, socketOptions),
    guardrails = {},
    logger: customLogger,
    logLevel,
    metrics: metricsOptions = {},
    bodyLimit,
    healthEndpoint = '/api/health',
    ...configOverrides
  } = options;

  const config = configFactory(configOverrides);
  const logger =
    customLogger ||
    createLogger({
      level: logLevel,
      service: 'server',
    });

  const app = expressAppFactory();
  const resolvedBodyLimit = bodyLimit || guardrails.bodyLimit || '1mb';
  app.disable('x-powered-by');
  app.use(express.json({ limit: resolvedBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: resolvedBodyLimit }));
  if (config.http && config.http.trustProxy !== undefined) {
    app.set('trust proxy', config.http.trustProxy);
  }

  const server = httpServerFactory(app);

  const io = socketServerFactory(server, {
    path: config.socket.path,
    transports: config.socket.transports,
    allowEIO3: config.socket.allowEIO3,
    pingTimeout: config.socket.pingTimeout,
    pingInterval: config.socket.pingInterval,
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  if (existsSync(config.paths.www)) {
    app.use(express.static(config.paths.www, {
      setHeaders: (res, path) => {
        // Не кешировать CSS и JS файлы для разработки
        if (path.endsWith('.css') || path.endsWith('.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
  }

  const metrics = createMetrics({
    name: 'server',
    ...metricsOptions,
  });

  if (metrics.enabled) {
    app.use(createHttpMetricsMiddleware(metrics, { logger }));
  }

  const persistenceDriver = (
    persistenceOptions.driver ||
    config.persistence?.driver ||
    'file'
  ).toLowerCase();

  const persistenceConfig = {
    backupDir: config.paths.backupDir,
    driver: persistenceDriver,
    connectionString:
      persistenceOptions.connectionString ??
      config.persistence?.connectionString ??
      '',
    pool: {
      ...(config.persistence?.pool || {}),
      ...(persistenceOptions.pool || {}),
    },
    statementTimeout:
      persistenceOptions.statementTimeout ??
      config.persistence?.statementTimeout,
    ssl: persistenceOptions.ssl ?? config.persistence?.ssl,
    enableBackups:
      persistenceOptions.enableBackups ??
      config.persistence?.enableBackups ??
      (persistenceDriver !== 'postgres'),
    poolInstance: persistenceOptions.poolInstance,
    logger,
    ...persistenceOptions,
  };

  const persistence = persistenceFactory(config.paths, persistenceConfig);
  logger.info('Persistence layer configured', {
    driver: persistenceDriver,
    hasConnectionString: Boolean(persistenceConfig.connectionString),
  });

  const {
    rateLimit: rateLimitOptions,
    auth: authOptions,
    apiNotFound: apiNotFoundOptions,
    errorHandler: errorHandlerOptions,
  } = guardrails;

  if (rateLimitOptions !== false) {
    const limiterConfig = {
      ...(rateLimitOptions || {}),
    };
    if (limiterConfig.max === undefined) {
      const envMax = toPositiveInteger(process.env.API_RATE_LIMIT_MAX);
      if (envMax) {
        limiterConfig.max = envMax;
      }
    }
    if (limiterConfig.windowMs === undefined) {
      const envWindow = toPositiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS);
      if (envWindow) {
        limiterConfig.windowMs = envWindow;
      }
    }
    app.use('/api', createRateLimiter(limiterConfig));
  }

  const envApiKeys = toArray(process.env.API_KEYS || process.env.API_KEY);
  const configuredAuthKeys =
    authOptions && authOptions !== false ? toArray(authOptions.apiKeys) : [];
  const resolvedApiKeys = Array.from(new Set([...configuredAuthKeys, ...envApiKeys]));

  let authConfig = null;
  if (authOptions !== false) {
    authConfig = {
      ...(authOptions || {}),
      apiKeys: resolvedApiKeys,
    };
    app.use('/api', createAuthMiddleware(authConfig));
  }

  routesRegistrar({ app, persistence, io, config, logger, metrics });
  socketsRegistrar({ io, persistence, config, logger, metrics });

  if (metrics.enabled) {
    const { exposeEndpoint } = metricsOptions;
    if (exposeEndpoint) {
      const metricsPath =
        typeof exposeEndpoint === 'string'
          ? exposeEndpoint
          : typeof metricsOptions.endpoint === 'string'
          ? metricsOptions.endpoint
          : '/api/metrics';

      const metricsAuthOptions = metricsOptions.auth;
      let metricsAuthConfig = null;
      if (metricsAuthOptions !== false) {
        const metricsKeys = Array.from(
          new Set([
            ...resolvedApiKeys,
            ...toArray(metricsAuthOptions?.apiKeys),
          ]),
        );
        metricsAuthConfig = {
          ...(metricsAuthOptions || {}),
          apiKeys: metricsKeys,
          required:
            metricsAuthOptions?.required ??
            metricsOptions.requireAuth ??
            (metricsKeys.length > 0),
        };
      }

      const metricsHandler = createMetricsHandler(metrics);
      if (metricsAuthConfig) {
        app.get(metricsPath, createAuthMiddleware(metricsAuthConfig), metricsHandler);
      } else {
        app.get(metricsPath, metricsHandler);
      }
    }
  }

  if (healthEndpoint) {
    app.get(healthEndpoint, (req, res) => {
      res.json({
        success: true,
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        connections: io.engine?.clientsCount ?? 0,
      });
    });
  }

  if (apiNotFoundOptions !== false) {
    app.use('/api', createApiNotFoundHandler(apiNotFoundOptions || {}));
  }

  if (errorHandlerOptions !== false) {
    app.use(createErrorResponder(errorHandlerOptions || {}));
  }

  return {
    app,
    server,
    io,
    config,
    persistence,
    logger,
    metrics,
  };
}

export default createServerApp;

