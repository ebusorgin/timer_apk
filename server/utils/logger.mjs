const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const DEFAULT_LEVEL = 'info';

const resolveLevel = (level) => {
  if (typeof level === 'number') {
    return level;
  }
  if (typeof level === 'string' && LEVELS[level.toLowerCase()]) {
    return LEVELS[level.toLowerCase()];
  }
  return LEVELS[DEFAULT_LEVEL];
};

const buildTarget = (target) => {
  if (target && ['info', 'warn', 'error', 'debug', 'trace'].every((method) => typeof target[method] === 'function')) {
    return target;
  }
  return console;
};

const shouldLog = (threshold, level) => level >= threshold;

const serializeContext = (context) => {
  if (!context || typeof context !== 'object') {
    return undefined;
  }
  const entries = Object.entries(context).filter(
    ([, value]) => value !== undefined && typeof value !== 'function',
  );
  if (!entries.length) {
    return undefined;
  }
  return Object.fromEntries(entries);
};

export function createLogger(options = {}) {
  if (options && typeof options.log === 'function') {
    return options;
  }

  const {
    level = DEFAULT_LEVEL,
    service = 'server',
    target = console,
    base = {},
  } = options;

  const threshold = resolveLevel(level);
  const outputTarget = buildTarget(target);
  const baseContext = serializeContext({ service, ...base }) || {};

  const emit = (levelName, message, context) => {
    const levelValue = resolveLevel(levelName);
    if (!shouldLog(threshold, levelValue)) {
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      ...baseContext,
    };

    const normalizedContext = serializeContext(context);
    if (normalizedContext) {
      record.context = normalizedContext;
    }

    const payload = JSON.stringify(record);

    switch (levelName) {
      case 'trace':
      case 'debug':
      case 'info':
        outputTarget.log(payload);
        break;
      case 'warn':
        (outputTarget.warn || outputTarget.log).call(outputTarget, payload);
        break;
      case 'error':
      case 'fatal':
        (outputTarget.error || outputTarget.log).call(outputTarget, payload);
        break;
      default:
        outputTarget.log(payload);
    }
  };

  const logger = {
    level,
    log: (lvl, message, context) => emit(lvl, message, context),
    trace: (message, context) => emit('trace', message, context),
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    fatal: (message, context) => emit('fatal', message, context),
    child: (additionalContext = {}) =>
      createLogger({
        level,
        service,
        target: outputTarget,
        base: { ...baseContext, ...serializeContext(additionalContext) },
      }),
  };

  return logger;
}

export default createLogger;

