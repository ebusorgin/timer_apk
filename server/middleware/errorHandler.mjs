const DEFAULT_ERROR_MESSAGE = 'Внутренняя ошибка сервера';

const resolveStatus = (error, fallback) => {
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  return (
    error.status ||
    error.statusCode ||
    (typeof error.code === 'number' ? error.code : undefined) ||
    fallback
  );
};

export function createErrorResponder(options = {}) {
  const {
    exposeStack = process.env.NODE_ENV !== 'production',
    defaultStatus = 500,
    defaultMessage = DEFAULT_ERROR_MESSAGE,
    stackLines = 5,
  } = options;

  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = resolveStatus(error, defaultStatus);
    const response = {
      success: false,
      error: error?.publicMessage || error?.message || defaultMessage,
    };

    if (error?.code && typeof error.code === 'string') {
      response.code = error.code;
    }

    if (error?.details) {
      response.details = error.details;
    }

    if (exposeStack && error?.stack) {
      const stack = error.stack.split('\n').slice(0, stackLines);
      response.stack = stack;
    }

    res.status(status).json(response);
  };
}

export default createErrorResponder;

