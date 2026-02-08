import { registerAuthRoutes } from './auth.mjs';
import { registerProgramsRoutes } from './programs.mjs';
import { registerMeRoutes } from './me.mjs';
import { registerAdminRoutes } from './admin.mjs';

export function registerRoutes({ app, persistence, logger }) {
  registerAuthRoutes({ app, persistence, logger });
  registerProgramsRoutes({ app, persistence, logger });
  registerMeRoutes({ app, persistence, logger });
  registerAdminRoutes({ app, persistence, logger });

  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });
}
