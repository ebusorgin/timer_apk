/**
 * Express app for relay + web API (exported for tests).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(__dirname, '..', 'web', 'dist');
import { RelayStore } from './store.mjs';
import { postMessage, getMessages } from './routes/messages.mjs';
import { postFederationMessages } from './routes/federation.mjs';
import * as authRoutes from './routes/auth.mjs';
import * as contactRoutes from './routes/contacts.mjs';
import * as webMessages from './routes/webMessages.mjs';
import { requireAuth } from './middleware/auth.mjs';

export const store = new RelayStore({
  maxMessages: Number(process.env.MAX_MESSAGES) || 100_000,
  maxStorageBytes: Number(process.env.MAX_STORAGE_BYTES) || 500 * 1024 * 1024,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/messages', postMessage(store));
app.get('/messages', getMessages(store));
app.post('/federation/messages', postFederationMessages(store));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    messages: store.totalMessages,
    bytes: store.totalBytes,
  });
});

app.post('/api/auth/register', authRoutes.register);
app.post('/api/auth/login', authRoutes.login);

app.get('/api/contacts', requireAuth, contactRoutes.list);
app.post('/api/contacts', requireAuth, contactRoutes.add);
app.delete('/api/contacts/:nodeId', requireAuth, contactRoutes.remove);

app.post('/api/messages/build', requireAuth, webMessages.build);
app.get('/api/messages', requireAuth, webMessages.list(store));

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

export default app;
