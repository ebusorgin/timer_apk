import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

describe('me/messages API', () => {
  let app;
  let server;
  let io;
  let request;
  let serverUrl;

  const userA = 'user-a-' + Date.now();
  const userB = 'user-b-' + Date.now();
  const dataDir = path.join(os.tmpdir(), 'conf-meMessages-' + Date.now() + '-' + Math.random().toString(36).slice(2));

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
    await request.post('/api/subscribers').send({ id: userA, name: 'User A' });
    await request.post('/api/subscribers').send({ id: userB, name: 'User B' });
    // Add mutual contacts so messaging is allowed
    const addRes = await request.post('/api/me/contacts').set('X-Subscriber-Id', userA).send({ contactId: userB });
    const reqId = addRes.body?.request?.id;
    if (reqId) {
      await request.post(`/api/me/contacts/requests/${reqId}/accept`).set('X-Subscriber-Id', userB);
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('GET /api/me/messages requires X-Subscriber-Id', async () => {
    const res = await request.get('/api/me/messages?contactId=' + userB);
    expect(res.status).toBe(401);
  });

  it('GET /api/me/messages requires contactId', async () => {
    const res = await request
      .get('/api/me/messages')
      .set('X-Subscriber-Id', userA);
    expect(res.status).toBe(400);
  });

  it('GET /api/me/messages returns empty for new chat', async () => {
    const res = await request
      .get('/api/me/messages?contactId=' + userB)
      .set('X-Subscriber-Id', userA);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messages).toEqual([]);
  });

  it('POST /api/me/messages sends message', async () => {
    const res = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userA)
      .send({ toId: userB, body: 'Hello!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatchObject({
      fromId: userA,
      toId: userB,
      body: 'Hello!',
    });
    expect(res.body.message.id).toBeDefined();
    expect(res.body.message.createdAt).toBeDefined();
  });

  it('POST /api/me/messages rejects empty body', async () => {
    const res = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userA)
      .send({ toId: userB, body: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/me/messages rejects unknown recipient', async () => {
    const res = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userA)
      .send({ toId: 'unknown-user', body: 'Hi' });
    expect(res.status).toBe(404);
  });

  it('GET /api/me/messages returns conversation both directions', async () => {
    const resA = await request
      .get('/api/me/messages?contactId=' + userB)
      .set('X-Subscriber-Id', userA);
    expect(resA.status).toBe(200);
    expect(resA.body.messages.length).toBe(1);
    expect(resA.body.messages[0].body).toBe('Hello!');

    const resB = await request
      .get('/api/me/messages?contactId=' + userA)
      .set('X-Subscriber-Id', userB);
    expect(resB.status).toBe(200);
    expect(resB.body.messages.length).toBe(1);
  });

  it('POST reply and both see full thread', async () => {
    const res = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userB)
      .send({ toId: userA, body: 'Hi back!' });
    expect(res.status).toBe(200);

    const thread = await request
      .get('/api/me/messages?contactId=' + userB)
      .set('X-Subscriber-Id', userA);
    expect(thread.body.messages.length).toBe(2);
    const bodies = thread.body.messages.map((m) => m.body);
    expect(bodies).toContain('Hello!');
    expect(bodies).toContain('Hi back!');
  });

  it('POST /api/me/messages rejects when toId is not a contact', async () => {
    const userX = 'user-x-' + Date.now();
    await request.post('/api/subscribers').send({ id: userX, name: 'User X' });
    const res = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userA)
      .send({ toId: userX, body: 'Hi' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('контактам');
  });

  it('POST /api/me/messages emits chat:message:new to recipient via socket', async () => {
    const userC = 'user-c-' + Date.now();
    const userD = 'user-d-' + Date.now();
    await request.post('/api/subscribers').send({ id: userC, name: 'User C' });
    await request.post('/api/subscribers').send({ id: userD, name: 'User D' });
    const addRes = await request.post('/api/me/contacts').set('X-Subscriber-Id', userC).send({ contactId: userD });
    const reqId = addRes.body?.request?.id;
    if (reqId) {
      await request.post(`/api/me/contacts/requests/${reqId}/accept`).set('X-Subscriber-Id', userD);
    }

    const client = ioClient(serverUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: { subscriberId: userD },
    });

    const eventPromise = new Promise((resolve) => {
      client.once('chat:message:new', (data) => resolve(data));
    });

    await new Promise((resolve) => client.once('connect', resolve));

    const sendRes = await request
      .post('/api/me/messages')
      .set('X-Subscriber-Id', userC)
      .send({ toId: userD, body: 'Real-time test!' });
    expect(sendRes.status).toBe(200);

    const received = await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for chat:message:new')), 2000)),
    ]);

    client.disconnect();

    expect(received).toBeDefined();
    expect(received.fromId).toBe(userC);
    expect(received.toId).toBe(userD);
    expect(received.body).toBe('Real-time test!');
  });
});
