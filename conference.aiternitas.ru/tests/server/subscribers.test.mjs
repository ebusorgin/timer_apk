import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-subscribers-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('subscribers API', () => {
  let app;
  let server;
  let io;
  let request;

  beforeAll(async () => {
    ({ app, server, io } = createServerApp({
      dataDir,
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    }));
    await new Promise((resolve) => server.listen(0, resolve));
    request = supertest(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('GET /api/subscribers returns list', async () => {
    const res = await request.get('/api/subscribers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.subscribers)).toBe(true);
  });

  it('POST /api/subscribers creates subscriber', async () => {
    const id = 'test-' + Date.now();
    const res = await request
      .post('/api/subscribers')
      .send({ id, name: 'Test User' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriber).toMatchObject({ id, name: 'Test User' });
    expect(Array.isArray(res.body.subscribers)).toBe(true);
  });

  it('POST /api/subscribers rejects empty id', async () => {
    const res = await request
      .post('/api/subscribers')
      .send({ id: '', name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('POST /api/subscribers rejects empty name', async () => {
    const res = await request
      .post('/api/subscribers')
      .send({ id: 'id1', name: '' });
    expect(res.status).toBe(400);
  });

  it('GET /api/subscribers/search returns filtered list by name', async () => {
    await request.post('/api/subscribers').send({ id: 'search-alpha', name: 'Alpha User' });
    await request.post('/api/subscribers').send({ id: 'search-beta', name: 'Beta User' });
    const res = await request.get('/api/subscribers/search?q=alpha');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const names = res.body.subscribers.map((s) => s.name);
    expect(names.some((n) => n.toLowerCase().includes('alpha'))).toBe(true);
  });

  it('GET /api/subscribers/search returns filtered list by id', async () => {
    const res = await request.get('/api/subscribers/search?q=search-beta');
    expect(res.status).toBe(200);
    expect(res.body.subscribers.some((s) => s.id.includes('search-beta'))).toBe(true);
  });

  it('GET /api/subscribers/search returns all when q is empty', async () => {
    const res = await request.get('/api/subscribers/search?q=');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.subscribers)).toBe(true);
  });
});
