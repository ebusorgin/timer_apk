import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

describe('observability and guardrails', () => {
  let app;
  let server;
  let io;
  let metrics;
  let request;
  let address;

  beforeEach(async () => {
    ({ app, server, io, metrics } = createServerApp({
      guardrails: {
        rateLimit: false,
        auth: false,
      },
      metrics: {
        exposeEndpoint: true,
      },
      logLevel: 'error',
    }));

    await new Promise((resolve) => {
      const listener = server.listen(0, () => {
        address = listener.address();
        resolve();
      });
    });

    request = supertest(app);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('rejects некорректный payload подписчика с единым форматом ошибки', async () => {
    const response = await request.post('/api/subscribers').send({ id: '', name: '' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BAD_REQUEST',
    });
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it('возвращает снимок метрик через /api/metrics', async () => {
    await request.get('/api/subscribers');

    const response = await request.get('/api/metrics');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.metrics).toMatchObject({
      http: expect.any(Object),
      sockets: expect.any(Object),
    });
    expect(response.body.metrics.http.total).toBeGreaterThan(0);
  });

  it('учитывает подключения по WebSocket в метриках', async () => {
    const client = ioClient(`http://127.0.0.1:${address.port}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    client.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const snapshot = metrics.getSnapshot();
    expect(snapshot.sockets.totalConnections).toBeGreaterThanOrEqual(1);
  });

  it('требует API-ключ для метрик при включённой защите', async () => {
    const apiKey = 'metrics-secret';

    await new Promise((resolve) => server.close(resolve));
    io.close();

    ({ app, server, io, metrics } = createServerApp({
      guardrails: {
        rateLimit: false,
        auth: false,
      },
      metrics: {
        exposeEndpoint: true,
        auth: {
          required: true,
          apiKeys: [apiKey],
        },
      },
      logLevel: 'error',
    }));

    await new Promise((resolve) => {
      const listener = server.listen(0, () => {
        address = listener.address();
        resolve();
      });
    });

    request = supertest(app);

    const unauthorized = await request.get('/api/metrics');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.success).toBe(false);

    const authorized = await request.get('/api/metrics').set('x-api-key', apiKey);
    expect(authorized.status).toBe(200);
    expect(authorized.body.success).toBe(true);
  });
});

