const toNumber = (value, precision = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(precision)) : 0;

export function createMetrics(options = {}) {
  const {
    enabled = true,
    name = 'server',
  } = options;

  const state = {
    enabled,
    name,
    startedAt: Date.now(),
    http: {
      total: 0,
      statuses: {},
      routes: new Map(),
    },
    sockets: {
      active: 0,
      totalConnections: 0,
      totalDurationMs: 0,
      closedCount: 0,
      connections: new Map(),
    },
  };

  const ensureEnabled = () => state.enabled;

  const recordHttp = ({ method, route, status, durationMs }) => {
    if (!ensureEnabled()) {
      return;
    }

    const normalizedMethod = (method || 'UNKNOWN').toUpperCase();
    const normalizedRoute = route || 'unknown';
    const key = `${normalizedMethod} ${normalizedRoute}`;

    state.http.total += 1;
    const statusCode = status || 0;
    state.http.statuses[statusCode] = (state.http.statuses[statusCode] || 0) + 1;

    const existing = state.http.routes.get(key) || {
      count: 0,
      totalDuration: 0,
      maxDuration: 0,
      lastDuration: 0,
    };

    existing.count += 1;
    existing.totalDuration += durationMs || 0;
    existing.lastDuration = durationMs || 0;
    existing.maxDuration = Math.max(existing.maxDuration, durationMs || 0);

    state.http.routes.set(key, existing);
  };

  const recordSocketConnection = (socketId) => {
    if (!ensureEnabled()) {
      return;
    }
    state.sockets.active += 1;
    state.sockets.totalConnections += 1;
    state.sockets.connections.set(socketId, Date.now());
  };

  const recordSocketDisconnection = (socketId) => {
    if (!ensureEnabled()) {
      return;
    }
    const startedAt = state.sockets.connections.get(socketId);
    if (startedAt) {
      state.sockets.connections.delete(socketId);
      const duration = Date.now() - startedAt;
      state.sockets.totalDurationMs += duration;
      state.sockets.closedCount += 1;
    }
    state.sockets.active = Math.max(0, state.sockets.active - 1);
  };

  const getSnapshot = () => {
    const uptime = Date.now() - state.startedAt;
    const httpRoutes = {};
    for (const [key, entry] of state.http.routes.entries()) {
      httpRoutes[key] = {
        count: entry.count,
        avgDurationMs: entry.count ? toNumber(entry.totalDuration / entry.count) : 0,
        maxDurationMs: toNumber(entry.maxDuration),
        lastDurationMs: toNumber(entry.lastDuration),
      };
    }

    return {
      name: state.name,
      startedAt: state.startedAt,
      uptimeSeconds: Math.round(uptime / 1000),
      http: {
        total: state.http.total,
        statuses: state.http.statuses,
        routes: httpRoutes,
      },
      sockets: {
        active: state.sockets.active,
        totalConnections: state.sockets.totalConnections,
        averageDurationMs: state.sockets.closedCount
          ? toNumber(state.sockets.totalDurationMs / state.sockets.closedCount)
          : 0,
      },
    };
  };

  const reset = () => {
    state.http.total = 0;
    state.http.statuses = {};
    state.http.routes.clear();
    state.sockets.active = state.sockets.connections.size;
    state.sockets.totalConnections = 0;
    state.sockets.totalDurationMs = 0;
    state.sockets.closedCount = 0;
  };

  return {
    get enabled() {
      return state.enabled;
    },
    set enabled(value) {
      state.enabled = Boolean(value);
    },
    recordHttp,
    recordSocketConnection,
    recordSocketDisconnection,
    getSnapshot,
    reset,
  };
}

export function createHttpMetricsMiddleware(metrics, options = {}) {
  const { logger, logThresholdMs = options.logThresholdMs || 2000 } = options;

  if (!metrics || !metrics.enabled) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const start = typeof process.hrtime === 'function' ? process.hrtime.bigint?.() : null;
    const startMs = start ? null : Date.now();
    let handled = false;

    const finalize = () => {
      if (handled) {
        return;
      }
      handled = true;
      const durationMs = start
        ? Number(process.hrtime.bigint() - start) / 1_000_000
        : Date.now() - startMs;
      const route =
        req.route?.path || req.route?.stack?.[0]?.route?.path || req.originalUrl.split('?')[0];

      metrics.recordHttp({
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
      });

      if (durationMs >= logThresholdMs && logger?.warn) {
        logger.warn('Медленный HTTP-запрос', {
          method: req.method,
          route,
          durationMs: toNumber(durationMs),
          status: res.statusCode,
        });
      }
    };

    res.on('finish', finalize);
    res.on('close', finalize);
    next();
  };
}

export function createMetricsHandler(metrics) {
  if (!metrics) {
    throw new Error('createMetricsHandler: сервис метрик не инициализирован.');
  }

  return (req, res) => {
    res.json({
      success: true,
      metrics: metrics.getSnapshot(),
    });
  };
}

export default {
  createMetrics,
  createHttpMetricsMiddleware,
  createMetricsHandler,
};

