const DEFAULT_HEADER = 'x-api-key';

export function createAuthMiddleware(options = {}) {
  const {
    required = false,
    headerName = DEFAULT_HEADER,
    apiKeys = [],
    tokenValidator = null,
    denyMessage = 'Требуется авторизация.',
    code = 'UNAUTHORIZED',
  } = options;

  const allowedKeys = new Set(
    Array.isArray(apiKeys) ? apiKeys.filter((key) => typeof key === 'string') : [],
  );

  return async (req, res, next) => {
    try {
      const apiKey = typeof headerName === 'string' ? req.get(headerName) : null;
      const authHeader = req.get('authorization');
      const bearerToken =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : null;

      let isAuthenticated = false;
      let identity = null;

      if (apiKey && allowedKeys.has(apiKey)) {
        isAuthenticated = true;
        identity = { type: 'apiKey', value: apiKey };
      } else if (typeof tokenValidator === 'function' && bearerToken) {
        const validationResult = await tokenValidator(bearerToken, { req });
        if (validationResult) {
          isAuthenticated = true;
          identity = {
            type: 'bearer',
            value: bearerToken,
            context: validationResult === true ? undefined : validationResult,
          };
        }
      }

      req.auth = {
        isAuthenticated,
        identity,
        apiKey,
        bearerToken,
      };

      if (required && !isAuthenticated) {
        res.status(401).json({
          success: false,
          error: denyMessage,
          code,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export default createAuthMiddleware;

