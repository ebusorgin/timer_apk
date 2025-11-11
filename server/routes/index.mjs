import registerSubscriberRoutes from './subscribers.mjs';
import registerCallRoutes from './calls.mjs';

export function registerRoutes({ app, persistence, io, logger, metrics }) {
  if (!app) {
    throw new Error('registerRoutes: app instance is required');
  }

  app.get('/cordova.js', (req, res) => {
    res.type('application/javascript');
    res.send('// Cordova.js placeholder\n');
  });

  registerSubscriberRoutes({ app, persistence, io, logger, metrics });
  registerCallRoutes({ app, persistence, io, logger, metrics });
}

export default registerRoutes;

