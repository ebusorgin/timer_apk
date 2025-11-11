export function createApiNotFoundHandler(options = {}) {
  const {
    message = 'Запрошенный API-эндпоинт не найден.',
    code = 'API_NOT_FOUND',
  } = options;

  return (req, res) => {
    res.status(404).json({
      success: false,
      error: message,
      code,
      path: req.originalUrl,
    });
  };
}

export default createApiNotFoundHandler;

