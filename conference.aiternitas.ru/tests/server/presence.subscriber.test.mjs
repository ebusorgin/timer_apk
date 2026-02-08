/**
 * Тесты presence:subscriber:online / presence:subscriber:offline.
 * Проверяют, что при подключении/отключении сокета с subscriberId
 * рассылаются события и статус в API корректно обновляется.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-presence-sub-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('presence subscriber (online/offline)', () => {
  let app, server, io, request, serverUrl;

  const ts = Date.now();
  const ALICE = { login: 'alice-pres-' + ts, name: 'Alice', password: 'alice1234', id: null };
  const BOB = { login: 'bob-pres-' + ts, name: 'Bob', password: 'bob12345', id: null };

  const headers = (id) => ({ 'X-Subscriber-Id': id });

  beforeAll(async () => {
    ({ app, server, io } = createServerApp({
      dataDir,
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    }));
    await new Promise((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
    request = supertest(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  describe('registration', () => {
    it('registers Alice and Bob', async () => {
      const resA = await request.post('/api/auth/register').send({
        login: ALICE.login, name: ALICE.name, password: ALICE.password,
      });
      const resB = await request.post('/api/auth/register').send({
        login: BOB.login, name: BOB.name, password: BOB.password,
      });
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      ALICE.id = resA.body.subscriber.id;
      BOB.id = resB.body.subscriber.id;
      expect(ALICE.id).toBeTruthy();
      expect(BOB.id).toBeTruthy();
    });
  });

  describe('online event on connect', () => {
    it('emits presence:subscriber:online when user connects with subscriberId', async () => {
      const onlineEvents = [];
      const client = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });

      client.on('presence:subscriber:online', (data) => {
        onlineEvents.push(data);
      });

      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(onlineEvents.some((e) => e.subscriberId === ALICE.id)).toBe(true);
      client.disconnect();
    });

    it('other connected client receives presence:subscriber:online when new user connects', async () => {
      const bobOnlineEvents = [];
      const clientBob = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: BOB.id },
      });
      clientBob.on('presence:subscriber:online', (data) => bobOnlineEvents.push(data));

      await new Promise((r, e) => {
        clientBob.once('connect', r);
        clientBob.once('connect_error', e);
      });
      await new Promise((r) => setTimeout(r, 50));

      const clientAlice = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });
      await new Promise((r, e) => {
        clientAlice.once('connect', r);
        clientAlice.once('connect_error', e);
      });
      await new Promise((r) => setTimeout(r, 100));

      expect(bobOnlineEvents.some((e) => e.subscriberId === ALICE.id)).toBe(true);

      clientAlice.disconnect();
      clientBob.disconnect();
    });
  });

  describe('offline event on disconnect', () => {
    it('emits presence:subscriber:offline when user disconnects', async () => {
      const offlineEvents = [];
      const clientBob = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: BOB.id },
      });
      const clientAlice = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });

      clientBob.on('presence:subscriber:offline', (data) => offlineEvents.push(data));

      await Promise.all([
        new Promise((r, e) => { clientBob.once('connect', r); clientBob.once('connect_error', e); }),
        new Promise((r, e) => { clientAlice.once('connect', r); clientAlice.once('connect_error', e); }),
      ]);
      await new Promise((r) => setTimeout(r, 80));

      clientAlice.disconnect();
      await new Promise((r) => setTimeout(r, 150));

      expect(offlineEvents.some((e) => e.subscriberId === ALICE.id)).toBe(true);
      clientBob.disconnect();
    });

    it('API /api/presence/status returns offline after user disconnects', async () => {
      const clientAlice = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });
      await new Promise((r, e) => {
        clientAlice.once('connect', r);
        clientAlice.once('connect_error', e);
      });
      await new Promise((r) => setTimeout(r, 50));

      const resBefore = await request
        .get(`/api/presence/status?ids=${ALICE.id},${BOB.id}`)
        .set(headers(ALICE.id));
      expect(resBefore.status).toBe(200);
      expect(resBefore.body.status[ALICE.id]).toBe(true);

      clientAlice.disconnect();
      await new Promise((r) => setTimeout(r, 120));

      const resAfter = await request
        .get(`/api/presence/status?ids=${ALICE.id},${BOB.id}`)
        .set(headers(BOB.id));
      expect(resAfter.status).toBe(200);
      expect(resAfter.body.status[ALICE.id]).toBe(false);
    });
  });

  describe('multi-tab: offline only when last socket disconnects', () => {
    it('does NOT emit offline when one of two tabs disconnects (same subscriberId)', async () => {
      const offlineEvents = [];
      const client1 = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });
      const client2 = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });
      const watcher = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: BOB.id },
      });
      watcher.on('presence:subscriber:offline', (data) => offlineEvents.push(data));

      await Promise.all([
        new Promise((r, e) => { client1.once('connect', r); client1.once('connect_error', e); }),
        new Promise((r, e) => { client2.once('connect', r); client2.once('connect_error', e); }),
        new Promise((r, e) => { watcher.once('connect', r); watcher.once('connect_error', e); }),
      ]);
      await new Promise((r) => setTimeout(r, 80));

      client1.disconnect();
      await new Promise((r) => setTimeout(r, 150));

      expect(offlineEvents.some((e) => e.subscriberId === ALICE.id)).toBe(false);

      client2.disconnect();
      await new Promise((r) => setTimeout(r, 150));
      expect(offlineEvents.some((e) => e.subscriberId === ALICE.id)).toBe(true);

      watcher.disconnect();
    });
  });

  describe('API presence status', () => {
    it('returns online=true for connected user, offline for disconnected', async () => {
      const client = ioClient(serverUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: false,
        auth: { subscriberId: ALICE.id },
      });
      await new Promise((r, e) => { client.once('connect', r); client.once('connect_error', e); });
      await new Promise((r) => setTimeout(r, 50));

      const res = await request
        .get(`/api/presence/status?ids=${ALICE.id},${BOB.id},nonexistent`)
        .set(headers(ALICE.id));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status[ALICE.id]).toBe(true);
      expect(res.body.status[BOB.id]).toBe(false);
      expect(res.body.status.nonexistent).toBe(false);

      client.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      const res2 = await request
        .get(`/api/presence/status?ids=${ALICE.id}`)
        .set(headers(BOB.id));
      expect(res2.body.status[ALICE.id]).toBe(false);
    });
  });
});
