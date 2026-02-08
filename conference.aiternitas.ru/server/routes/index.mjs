import { createJwtAuthMiddleware, createJwtOrTestAuthMiddleware } from '../middleware/jwtAuth.mjs';
import registerSubscriberRoutes from './subscribers.mjs';
import registerCallRoutes from './calls.mjs';
import registerMeContactsRoutes from './meContacts.mjs';
import registerMeMessagesRoutes from './meMessages.mjs';
import registerAuthRoutes from './auth.mjs';
import registerMeProfileRoutes from './meProfile.mjs';
import { registerRoomsRoutes } from './rooms.mjs';
import { registerPresenceRoutes } from './presence.mjs';
import { registerAdminRoutes } from './admin.mjs';

export function registerRoutes({ app, persistence, io, config, logger, metrics, subscriberAuth: customAuth, useTestAuth }) {
  if (!app) {
    throw new Error('registerRoutes: app instance is required');
  }

  app.get('/cordova.js', (req, res) => {
    res.type('application/javascript');
    res.send('// Cordova.js placeholder\n');
  });

  const auth = customAuth || (useTestAuth ? createJwtOrTestAuthMiddleware(persistence) : createJwtAuthMiddleware(persistence));

  registerAuthRoutes({ app, persistence, logger });
  registerSubscriberRoutes({ app, persistence, io, logger, metrics });
  registerCallRoutes({ app, persistence, io, subscriberAuth: auth, logger, metrics });
  registerMeContactsRoutes({ app, persistence, io, subscriberAuth: auth, logger });
  registerMeMessagesRoutes({ app, persistence, io, subscriberAuth: auth, logger });
  registerMeProfileRoutes({ app, persistence, subscriberAuth: auth, config, logger });
  registerPresenceRoutes({ app, subscriberAuth: auth, logger });
  registerAdminRoutes({ app, persistence, io, subscriberAuth: auth, logger });
  registerRoomsRoutes({ app });
}

export default registerRoutes;

