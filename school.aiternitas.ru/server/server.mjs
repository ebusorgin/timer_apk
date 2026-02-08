import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import createConfig from './config.mjs';
import { createPersistence } from './persistence/index.mjs';
import { registerRoutes } from './routes/index.mjs';
import { initRedis } from './services/redis.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3010', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required. Copy .env.example to .env and configure.');
    process.exit(1);
  }

  const config = createConfig();
  const logger = { info: console.log, error: console.error, child: () => logger };

  const persistence = await createPersistence(
    {
      connectionString: DATABASE_URL,
      pool: { max: 10 },
    },
    logger
  );

  await initRedis();

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      message: { success: false, error: 'Слишком много запросов' },
    })
  );

  registerRoutes({ app, persistence, logger });

  const wwwPath = path.join(__dirname, '..', 'client', 'dist', 'client', 'browser');
  const wwwExists = await import('fs').then((fs) => fs.promises.access(wwwPath).then(() => true).catch(() => false));

  if (wwwExists) {
    app.use(express.static(wwwPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(wwwPath, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>School</title></head>
        <body>
          <h1>School.aiternitas.ru</h1>
          <p>Backend работает. Соберите Angular: <code>cd client && npm run build</code></p>
          <p><a href="/api/programs">/api/programs</a></p>
        </body></html>
      `);
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`School server on http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
