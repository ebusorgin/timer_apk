import express from 'express';
import { registerRoutes } from '../../server/routes/index.mjs';

export function createTestApp(persistence) {
  const app = express();
  app.use(express.json());
  const logger = { info: () => {}, error: () => {}, child: () => logger };
  registerRoutes({ app, persistence, logger });
  return app;
}
