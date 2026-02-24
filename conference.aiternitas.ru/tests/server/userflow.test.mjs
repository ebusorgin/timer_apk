/**
 * Полный E2E userflow-тест.
 * Три пользователя проходят все пути: регистрация, вход, контакты, чат, звонки, комнаты, профиль.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-userflow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));

// Increase timeout for complex E2E userflow
import { vi } from 'vitest';
vi.setConfig({ testTimeout: 30000 });

describe('Full userflow E2E', () => {
  let app, server, io, request, serverUrl;

  const ts = Date.now();
  const ALICE = { login: 'alice-' + ts, name: 'Alice', password: 'alice1234', id: null };
  const BOB = { login: 'bob-' + ts, name: 'Bob', password: 'bob12345', id: null };
  const CAROL = { login: 'carol-' + ts, name: 'Carol', password: 'carol1234', id: null };

  const headers = (userId) => ({ 'X-Subscriber-Id': userId });

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

  // ========== 1. РЕГИСТРАЦИЯ И ВХОД ==========

  describe('1. Auth: registration and login', () => {
    it('Alice registers successfully', async () => {
      const res = await request.post('/api/auth/register').send({
        login: ALICE.login, name: ALICE.name, password: ALICE.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subscriber.id).toBeDefined();
      ALICE.id = res.body.subscriber.id;
      expect(res.body.subscriber.name).toBe('Alice');
      expect(res.body.subscriber.passwordHash).toBeUndefined();
    });

    it('Bob registers successfully', async () => {
      const res = await request.post('/api/auth/register').send({
        login: BOB.login, name: BOB.name, password: BOB.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.id).toBeDefined();
      BOB.id = res.body.subscriber.id;
    });

    it('Carol registers successfully', async () => {
      const res = await request.post('/api/auth/register').send({
        login: CAROL.login, name: CAROL.name, password: CAROL.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.id).toBeDefined();
      CAROL.id = res.body.subscriber.id;
    });

    it('duplicate registration rejected', async () => {
      const res = await request.post('/api/auth/register').send({
        login: ALICE.login, name: 'Fake Alice', password: 'fakepass1',
      });
      expect(res.status).toBe(409);
    });

    it('Alice logs in with correct password', async () => {
      const res = await request.post('/api/auth/login').send({
        login: ALICE.login, password: ALICE.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.name).toBe('Alice');
    });

    it('Alice login fails with wrong password', async () => {
      const res = await request.post('/api/auth/login').send({
        login: ALICE.login, password: 'wrongwrong',
      });
      expect(res.status).toBe(401);
    });

    it('login with non-existent user fails', async () => {
      const res = await request.post('/api/auth/login').send({
        login: 'ghost-user', password: 'whatever',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/subscribers cannot overwrite registered user', async () => {
      const res = await request.post('/api/subscribers').send({
        id: ALICE.id, name: 'Overwritten',
      });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.name).toBe('Alice');
    });
  });

  // ========== 2. КОНТАКТЫ (3 пользователя) ==========

  describe('2. Contacts: request, accept, decline, delete', () => {
    let aliceToBobRequestId;
    let aliceToCarolRequestId;

    it('all users start with empty contacts', async () => {
      for (const u of [ALICE, BOB, CAROL]) {
        const res = await request.get('/api/me/contacts').set(headers(u.id));
        expect(res.status).toBe(200);
        expect(res.body.contacts).toEqual([]);
      }
    });

    it('Alice sends contact request to Bob', async () => {
      const res = await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: BOB.id });
      expect(res.status).toBe(200);
      expect(res.body.request.fromId).toBe(ALICE.id);
      expect(res.body.request.toId).toBe(BOB.id);
      expect(res.body.request.status).toBe('pending');
      aliceToBobRequestId = res.body.request.id;
    });

    it('Alice sends contact request to Carol', async () => {
      const res = await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: CAROL.id });
      expect(res.status).toBe(200);
      aliceToCarolRequestId = res.body.request.id;
    });

    it('Alice cannot add herself', async () => {
      const res = await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: ALICE.id });
      expect(res.status).toBe(400);
    });

    it('Alice cannot add non-existent user', async () => {
      const res = await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: 'ghost-id' });
      expect(res.status).toBe(404);
    });

    it('contacts still empty (pending requests)', async () => {
      const res = await request.get('/api/me/contacts').set(headers(ALICE.id));
      expect(res.body.contacts).toEqual([]);
    });

    it('Bob sees pending request from Alice', async () => {
      const res = await request.get('/api/me/contacts/requests').set(headers(BOB.id));
      expect(res.status).toBe(200);
      expect(res.body.requests.length).toBe(1);
      expect(res.body.requests[0].fromId).toBe(ALICE.id);
      expect(res.body.requests[0].fromName).toBe('Alice');
    });

    it('Carol sees pending request from Alice', async () => {
      const res = await request.get('/api/me/contacts/requests').set(headers(CAROL.id));
      expect(res.body.requests.length).toBe(1);
    });

    it('Bob accepts Alice request', async () => {
      const res = await request.post(`/api/me/contacts/requests/${aliceToBobRequestId}/accept`)
        .set(headers(BOB.id));
      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(true);
    });

    it('Alice and Bob are now mutual contacts', async () => {
      const aliceContacts = await request.get('/api/me/contacts').set(headers(ALICE.id));
      expect(aliceContacts.body.contacts.length).toBe(1);
      expect(aliceContacts.body.contacts[0].id).toBe(BOB.id);

      const bobContacts = await request.get('/api/me/contacts').set(headers(BOB.id));
      expect(bobContacts.body.contacts.length).toBe(1);
      expect(bobContacts.body.contacts[0].id).toBe(ALICE.id);
    });

    it('Carol declines Alice request', async () => {
      const res = await request.post(`/api/me/contacts/requests/${aliceToCarolRequestId}/decline`)
        .set(headers(CAROL.id));
      expect(res.status).toBe(200);
      expect(res.body.declined).toBe(true);
    });

    it('Alice and Carol are NOT contacts after decline', async () => {
      const aliceContacts = await request.get('/api/me/contacts').set(headers(ALICE.id));
      expect(aliceContacts.body.contacts.every((c) => c.id !== CAROL.id)).toBe(true);

      const carolContacts = await request.get('/api/me/contacts').set(headers(CAROL.id));
      expect(carolContacts.body.contacts).toEqual([]);
    });

    it('re-accept already processed request returns 400', async () => {
      const res = await request.post(`/api/me/contacts/requests/${aliceToBobRequestId}/accept`)
        .set(headers(BOB.id));
      expect(res.status).toBe(400);
    });

    it('duplicate request to already-in-contacts returns 409', async () => {
      const res = await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: BOB.id });
      expect(res.status).toBe(409);
    });

    it('Bob sends request to Carol, Carol accepts', async () => {
      const reqRes = await request.post('/api/me/contacts')
        .set(headers(BOB.id))
        .send({ contactId: CAROL.id });
      expect(reqRes.status).toBe(200);
      const rid = reqRes.body.request.id;

      const acceptRes = await request.post(`/api/me/contacts/requests/${rid}/accept`)
        .set(headers(CAROL.id));
      expect(acceptRes.status).toBe(200);

      const bobContacts = await request.get('/api/me/contacts').set(headers(BOB.id));
      expect(bobContacts.body.contacts.length).toBe(2); // Alice + Carol
    });

    it('Alice deletes Bob from contacts', async () => {
      const res = await request.delete(`/api/me/contacts/${BOB.id}`)
        .set(headers(ALICE.id));
      expect(res.status).toBe(200);

      const aliceContacts = await request.get('/api/me/contacts').set(headers(ALICE.id));
      expect(aliceContacts.body.contacts).toEqual([]);
    });
  });

  // ========== 3. ЧАТ ==========

  describe('3. Chat: messages between users', () => {
    it('Bob sends message to Carol', async () => {
      const res = await request.post('/api/me/messages')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, body: 'Привет, Carol!' });
      expect(res.status).toBe(200);
      expect(res.body.message.fromId).toBe(BOB.id);
      expect(res.body.message.toId).toBe(CAROL.id);
      expect(res.body.message.body).toBe('Привет, Carol!');
    });

    it('Carol replies to Bob', async () => {
      const res = await request.post('/api/me/messages')
        .set(headers(CAROL.id))
        .send({ toId: BOB.id, body: 'Привет, Bob!' });
      expect(res.status).toBe(200);
    });

    it('Bob sees full conversation', async () => {
      const res = await request.get(`/api/me/messages?contactId=${CAROL.id}`)
        .set(headers(BOB.id));
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(2);
      const bodies = res.body.messages.map((m) => m.body);
      expect(bodies).toContain('Привет, Carol!');
      expect(bodies).toContain('Привет, Bob!');
    });

    it('Carol sees same conversation', async () => {
      const res = await request.get(`/api/me/messages?contactId=${BOB.id}`)
        .set(headers(CAROL.id));
      expect(res.body.messages.length).toBe(2);
    });

    it('empty body rejected', async () => {
      const res = await request.post('/api/me/messages')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, body: '' });
      expect(res.status).toBe(400);
    });

    it('message to non-existent user rejected', async () => {
      const res = await request.post('/api/me/messages')
        .set(headers(BOB.id))
        .send({ toId: 'ghost-user', body: 'hello' });
      expect(res.status).toBe(404);
    });

    it('chat:message:new emitted via socket', async () => {
      const client = ioClient(serverUrl, {
        path: '/socket.io/', transports: ['websocket', 'polling'],
        auth: { subscriberId: CAROL.id },
      });
      const eventPromise = new Promise((resolve) => {
        client.once('chat:message:new', (data) => resolve(data));
      });
      await new Promise((resolve) => client.once('connect', resolve));

      await request.post('/api/me/messages')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, body: 'Socket test!' });

      const msg = await Promise.race([
        eventPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000)),
      ]);
      client.disconnect();
      expect(msg.body).toBe('Socket test!');
      expect(msg.fromId).toBe(BOB.id);
    });
  });

  // ========== 4. ЗВОНКИ (аудио/видео) ==========

  describe('4. Calls: audio, video, incoming, decline', () => {
    it('Bob calls Carol (audio)', async () => {
      const res = await request.post('/api/calls')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, fromName: BOB.name, callType: 'audio' });
      expect(res.status).toBe(200);
      expect(res.body.call.callType).toBe('audio');
      expect(res.body.call.from.id).toBe(BOB.id);
      expect(res.body.call.to.id).toBe(CAROL.id);
      expect(res.body.call.status).toBe('pending');
    });

    it('Carol calls Bob (video)', async () => {
      const res = await request.post('/api/calls')
        .set(headers(CAROL.id))
        .send({ toId: BOB.id, fromName: CAROL.name, callType: 'video' });
      expect(res.status).toBe(200);
      expect(res.body.call.callType).toBe('video');
    });

    it('default callType is audio', async () => {
      const res = await request.post('/api/calls')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, fromName: BOB.name });
      expect(res.status).toBe(200);
      expect(res.body.call.callType).toBe('audio');
    });

    it('Carol has pending calls', async () => {
      const res = await request.get(`/api/calls/pending/${CAROL.id}`).set(headers(CAROL.id));
      expect(res.status).toBe(200);
      expect(res.body.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('Carol accepts a call', async () => {
      const pending = await request.get(`/api/calls/pending/${CAROL.id}`).set(headers(CAROL.id));
      const callId = pending.body.calls[0].id;
      const res = await request.post(`/api/calls/${callId}/ack`)
        .set(headers(CAROL.id))
        .send({ status: 'acknowledged' });
      expect(res.status).toBe(200);
      expect(res.body.call.status).toBe('acknowledged');
    });

    it('Bob declines incoming call', async () => {
      const pending = await request.get(`/api/calls/pending/${BOB.id}`).set(headers(BOB.id));
      if (pending.body.calls?.length > 0) {
        const callId = pending.body.calls[0].id;
        const res = await request.post(`/api/calls/${callId}/ack`)
          .set(headers(BOB.id))
          .send({ status: 'declined' });
        expect(res.status).toBe(200);
        expect(res.body.call.status).toBe('declined');
      }
    });

    it('call from unregistered user returns 401 (auth rejects unknown X-Subscriber-Id)', async () => {
      const res = await request.post('/api/calls')
        .set(headers('ghost'))
        .send({ toId: CAROL.id, fromName: 'Ghost' });
      expect(res.status).toBe(401);
    });

    it('call to unregistered user rejected', async () => {
      const res = await request.post('/api/calls')
        .set(headers(BOB.id))
        .send({ toId: 'ghost', fromName: BOB.name });
      expect(res.status).toBe(404);
    });

    it('call:initiated emitted via socket', async () => {
      const client = ioClient(serverUrl, {
        path: '/socket.io/', transports: ['websocket', 'polling'],
        auth: { subscriberId: CAROL.id },
      });
      const eventPromise = new Promise((resolve) => {
        client.once('call:initiated', (data) => resolve(data));
      });
      await new Promise((resolve) => client.once('connect', resolve));

      await request.post('/api/calls')
        .set(headers(BOB.id))
        .send({ toId: CAROL.id, fromName: BOB.name, callType: 'video' });

      const call = await Promise.race([
        eventPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000)),
      ]);
      client.disconnect();
      expect(call.callType).toBe('video');
      expect(call.from.id).toBe(BOB.id);
    });
  });

  // ========== 5. КОМНАТЫ ==========

  describe('5. Rooms: create, join, participants', () => {
    it('GET /api/rooms returns empty initially', async () => {
      const res = await request.get('/api/rooms');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rooms)).toBe(true);
    });

    it('joining a room creates it in rooms list', async () => {
      const client = ioClient(serverUrl, {
        path: '/socket.io/', transports: ['websocket'],
        reconnection: false,
      });
      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });

      client.emit('room:join', { roomId: 'test-flow-room', displayName: 'Alice' });
      await new Promise((r) => setTimeout(r, 150));

      const res = await request.get('/api/rooms');
      const room = res.body.rooms.find((r) => r.roomId === 'test-flow-room');
      expect(room).toBeDefined();
      expect(room.participantCount).toBe(1);

      client.disconnect();
    });

    it('two users in same room', async () => {
      const c1 = ioClient(serverUrl, { path: '/socket.io/', transports: ['websocket'], reconnection: false });
      const c2 = ioClient(serverUrl, { path: '/socket.io/', transports: ['websocket'], reconnection: false });

      await Promise.all([
        new Promise((r) => c1.once('connect', r)),
        new Promise((r) => c2.once('connect', r)),
      ]);

      c1.emit('room:join', { roomId: 'shared-room', displayName: 'Bob' });
      c2.emit('room:join', { roomId: 'shared-room', displayName: 'Carol' });
      await new Promise((r) => setTimeout(r, 200));

      const res = await request.get('/api/rooms');
      const room = res.body.rooms.find((r) => r.roomId === 'shared-room');
      expect(room).toBeDefined();
      expect(room.participantCount).toBe(2);

      c1.disconnect();
      c2.disconnect();
    });

    it('three users in same room', async () => {
      const clients = [1, 2, 3].map(() =>
        ioClient(serverUrl, { path: '/socket.io/', transports: ['websocket'], reconnection: false })
      );

      await Promise.all(clients.map((c) => new Promise((r) => c.once('connect', r))));

      clients.forEach((c, i) => c.emit('room:join', { roomId: 'big-room', displayName: `User${i + 1}` }));
      await new Promise((r) => setTimeout(r, 200));

      const res = await request.get('/api/rooms');
      const room = res.body.rooms.find((r) => r.roomId === 'big-room');
      expect(room).toBeDefined();
      expect(room.participantCount).toBe(3);

      clients.forEach((c) => c.disconnect());
    });
  });

  // ========== 6. ПРОФИЛЬ ==========

  describe('6. Profile: update name, avatar, get profile', () => {
    it('Alice gets her profile', async () => {
      const res = await request.get('/api/me/profile').set(headers(ALICE.id));
      expect(res.status).toBe(200);
      expect(res.body.profile.id).toBe(ALICE.id);
      expect(res.body.profile.name).toBe('Alice');
    });

    it('profile requires auth', async () => {
      const res = await request.get('/api/me/profile');
      expect(res.status).toBe(401);
    });

    it('Alice updates her name', async () => {
      const res = await request.put('/api/me/profile')
        .set(headers(ALICE.id))
        .send({ name: 'Alice Updated' });
      expect(res.status).toBe(200);
      expect(res.body.profile.name).toBe('Alice Updated');
    });

    it('Alice can still login after name change', async () => {
      const res = await request.post('/api/auth/login').send({
        login: ALICE.login, password: ALICE.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.name).toBe('Alice Updated');
    });

    it('empty name rejected', async () => {
      const res = await request.put('/api/me/profile')
        .set(headers(ALICE.id))
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('avatar upload works', async () => {
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const res = await request.post('/api/me/avatar')
        .set(headers(ALICE.id))
        .attach('avatar', png, 'avatar.png');
      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toContain('/uploads/avatars/');
    });

    it('profile shows avatarUrl after upload', async () => {
      const res = await request.get('/api/me/profile').set(headers(ALICE.id));
      expect(res.body.profile.avatarUrl).toContain('/uploads/avatars/');
    });

    it('search shows users by name', async () => {
      const res = await request.get('/api/subscribers/search?q=Bob');
      expect(res.status).toBe(200);
      expect(res.body.subscribers.some((s) => s.id === BOB.id)).toBe(true);
    });

    it('search shows users by id', async () => {
      const res = await request.get(`/api/subscribers/search?q=${CAROL.id}`);
      expect(res.status).toBe(200);
      expect(res.body.subscribers.some((s) => s.id === CAROL.id)).toBe(true);
    });
  });

  // ========== 7. SOCKET УВЕДОМЛЕНИЯ ==========

  describe('7. Socket notifications: contact requests', () => {
    it('contact:request emitted to target user', async () => {
      // Re-add Alice to Carol's contacts via new request
      const client = ioClient(serverUrl, {
        path: '/socket.io/', transports: ['websocket', 'polling'],
        auth: { subscriberId: CAROL.id },
      });
      const eventPromise = new Promise((resolve) => {
        client.once('contact:request', (data) => resolve(data));
      });
      await new Promise((resolve) => client.once('connect', resolve));

      await request.post('/api/me/contacts')
        .set(headers(ALICE.id))
        .send({ contactId: CAROL.id });

      const data = await Promise.race([
        eventPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000)),
      ]);
      client.disconnect();
      expect(data.fromId).toBe(ALICE.id);
    });

    it('contact:request:accepted emitted to requester', async () => {
      // Get the pending request
      const pending = await request.get('/api/me/contacts/requests').set(headers(CAROL.id));
      const requests = pending.body.requests || [];
      const rid = requests.find((r) => String(r.fromId) === String(ALICE.id))?.id;
      expect(rid).toBeDefined();

      const client = ioClient(serverUrl, {
        path: '/socket.io/', transports: ['websocket', 'polling'],
        auth: { subscriberId: ALICE.id },
      });
      const eventPromise = new Promise((resolve) => {
        client.once('contact:request:accepted', (data) => resolve(data));
      });
      await new Promise((resolve) => client.once('connect', resolve));

      await request.post(`/api/me/contacts/requests/${rid}/accept`)
        .set(headers(CAROL.id));

      const data = await Promise.race([
        eventPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000)),
      ]);
      client.disconnect();
      expect(data.requestId).toBe(rid);
    });
  });

  // ========== 8. EDGE CASES ==========

  describe('8. Edge cases and validation', () => {
    it('unauthenticated requests return 401', async () => {
      const endpoints = [
        () => request.get('/api/me/contacts'),
        () => request.get('/api/me/contacts/requests'),
        () => request.post('/api/me/contacts').send({ contactId: BOB.id }),
        () => request.get('/api/me/messages?contactId=' + BOB.id),
        () => request.post('/api/me/messages').send({ toId: BOB.id, body: 'hi' }),
        () => request.get('/api/me/profile'),
        () => request.put('/api/me/profile').send({ name: 'x' }),
      ];
      for (const fn of endpoints) {
        const res = await fn();
        expect(res.status).toBe(401);
      }
    });

    it('unknown subscriber returns 401', async () => {
      const res = await request.get('/api/me/contacts')
        .set(headers('nonexistent-id'));
      expect(res.status).toBe(401);
    });

    it('health endpoint works', async () => {
      const res = await request.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('unknown API route returns 404', async () => {
      const res = await request.get('/api/totally-unknown');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('API_NOT_FOUND');
    });
  });
});
