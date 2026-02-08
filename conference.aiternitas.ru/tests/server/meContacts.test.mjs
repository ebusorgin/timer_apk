import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

describe('me/contacts request flow', () => {
  let app;
  let server;
  let io;
  let request;
  let serverUrl;

  const userA = 'userA-' + Date.now();
  const userB = 'userB-' + Date.now();
  const dataDir = path.join(os.tmpdir(), 'conf-meContacts-' + Date.now() + '-' + Math.random().toString(36).slice(2));

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
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  // --- Auth ---
  it('GET /api/me/contacts requires auth', async () => {
    const res = await request.get('/api/me/contacts');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('GET /api/me/contacts returns 401 for unknown subscriber', async () => {
    const res = await request
      .get('/api/me/contacts')
      .set('X-Subscriber-Id', 'unknown-subscriber');
    expect(res.status).toBe(401);
    expect(['USER_NOT_FOUND', 'SUBSCRIBER_NOT_FOUND']).toContain(res.body.code);
  });

  // --- Empty state ---
  it('GET /api/me/contacts returns empty list initially', async () => {
    const res = await request
      .get('/api/me/contacts')
      .set('X-Subscriber-Id', userA);
    expect(res.status).toBe(200);
    expect(res.body.contacts).toEqual([]);
  });

  it('GET /api/me/contacts/requests returns empty initially', async () => {
    const res = await request
      .get('/api/me/contacts/requests')
      .set('X-Subscriber-Id', userB);
    expect(res.status).toBe(200);
    expect(res.body.requests).toEqual([]);
  });

  // --- Create request ---
  let requestId;

  it('POST /api/me/contacts sends a contact request (not direct add)', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: userB });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request).toBeDefined();
    expect(res.body.request.fromId).toBe(userA);
    expect(res.body.request.toId).toBe(userB);
    expect(res.body.request.status).toBe('pending');
    requestId = res.body.request.id;
  });

  it('contact is NOT added yet after request', async () => {
    const res = await request
      .get('/api/me/contacts')
      .set('X-Subscriber-Id', userA);
    expect(res.body.contacts).toEqual([]);
  });

  it('userB sees pending request', async () => {
    const res = await request
      .get('/api/me/contacts/requests')
      .set('X-Subscriber-Id', userB);
    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(1);
    expect(res.body.requests[0].fromId).toBe(userA);
    expect(res.body.requests[0].fromName).toBe('User A');
  });

  it('rejects adding self', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: userA });
    expect(res.status).toBe(400);
  });

  it('rejects unknown contact', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: 'non-existent' });
    expect(res.status).toBe(404);
  });

  it('add contact by login works when getSubscriberById returns null', async () => {
    const uid = 'userByLogin-' + Date.now();
    const loginName = 'UniqueLogin' + Date.now();
    await request.post('/api/subscribers').send({ id: uid, name: loginName });
    const res = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: uid });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request.toId).toBe(uid);
  });

  // --- Accept ---
  it('userB accepts the request', async () => {
    const res = await request
      .post(`/api/me/contacts/requests/${requestId}/accept`)
      .set('X-Subscriber-Id', userB);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  it('both users now have each other in contacts', async () => {
    const resA = await request.get('/api/me/contacts').set('X-Subscriber-Id', userA);
    expect(resA.body.contacts.length).toBe(1);
    expect(resA.body.contacts[0].id).toBe(userB);

    const resB = await request.get('/api/me/contacts').set('X-Subscriber-Id', userB);
    expect(resB.body.contacts.length).toBe(1);
    expect(resB.body.contacts[0].id).toBe(userA);
  });

  it('accepting again returns 400 (already processed)', async () => {
    const res = await request
      .post(`/api/me/contacts/requests/${requestId}/accept`)
      .set('X-Subscriber-Id', userB);
    expect(res.status).toBe(400);
  });

  it('adding already-in-contacts user returns 409', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: userB });
    expect(res.status).toBe(409);
  });

  // --- Decline flow ---
  it('decline flow works end to end', async () => {
    const userC = 'userC-' + Date.now();
    await request.post('/api/subscribers').send({ id: userC, name: 'User C' });

    const reqRes = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userA)
      .send({ contactId: userC });
    expect(reqRes.status).toBe(200);
    const declineRequestId = reqRes.body.request.id;

    const declineRes = await request
      .post(`/api/me/contacts/requests/${declineRequestId}/decline`)
      .set('X-Subscriber-Id', userC);
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.declined).toBe(true);

    // userA should not have userC in contacts
    const contacts = await request.get('/api/me/contacts').set('X-Subscriber-Id', userA);
    expect(contacts.body.contacts.every((c) => c.id !== userC)).toBe(true);
  });

  // --- Delete contact ---
  it('DELETE /api/me/contacts/:contactId removes contact', async () => {
    const res = await request
      .delete(`/api/me/contacts/${userB}`)
      .set('X-Subscriber-Id', userA);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const after = await request.get('/api/me/contacts').set('X-Subscriber-Id', userA);
    expect(after.body.contacts).toEqual([]);
  });

  // --- Socket notification ---
  it('contact:request is emitted to recipient via socket', async () => {
    const userD = 'userD-' + Date.now();
    const userE = 'userE-' + Date.now();
    await request.post('/api/subscribers').send({ id: userD, name: 'User D' });
    await request.post('/api/subscribers').send({ id: userE, name: 'User E' });

    const client = ioClient(serverUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: { subscriberId: userE },
    });

    const eventPromise = new Promise((resolve) => {
      client.once('contact:request', (data) => resolve(data));
    });

    await new Promise((resolve) => client.once('connect', resolve));

    await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userD)
      .send({ contactId: userE });

    const received = await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]);

    client.disconnect();

    expect(received.fromId).toBe(userD);
    expect(received.fromName).toBe('User D');
  });

  it('contact:request:accepted is emitted to requester via socket', async () => {
    const userF = 'userF-' + Date.now();
    const userG = 'userG-' + Date.now();
    await request.post('/api/subscribers').send({ id: userF, name: 'User F' });
    await request.post('/api/subscribers').send({ id: userG, name: 'User G' });

    const reqRes = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userF)
      .send({ contactId: userG });
    const rid = reqRes.body.request.id;

    const client = ioClient(serverUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: { subscriberId: userF },
    });

    const eventPromise = new Promise((resolve) => {
      client.once('contact:request:accepted', (data) => resolve(data));
    });

    await new Promise((resolve) => client.once('connect', resolve));

    await request
      .post(`/api/me/contacts/requests/${rid}/accept`)
      .set('X-Subscriber-Id', userG);

    const received = await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]);

    client.disconnect();

    expect(received.requestId).toBe(rid);
    expect(received.contactName).toBe('User G');
  });

  it('contact:request:declined is NOT emitted to sender (sender must not know about decline)', async () => {
    const userH = 'userH-' + Date.now();
    const userI = 'userI-' + Date.now();
    await request.post('/api/subscribers').send({ id: userH, name: 'User H' });
    await request.post('/api/subscribers').send({ id: userI, name: 'User I' });

    const reqRes = await request
      .post('/api/me/contacts')
      .set('X-Subscriber-Id', userH)
      .send({ contactId: userI });
    const rid = reqRes.body.request.id;

    const client = ioClient(serverUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: { subscriberId: userH },
    });

    const declinedReceived = new Promise((resolve) => {
      client.once('contact:request:declined', () => resolve(true));
    });

    await new Promise((resolve) => client.once('connect', resolve));

    await request
      .post(`/api/me/contacts/requests/${rid}/decline`)
      .set('X-Subscriber-Id', userI);

    const gotDeclined = await Promise.race([
      declinedReceived,
      new Promise((resolve) => setTimeout(() => resolve(false), 500)),
    ]);

    client.disconnect();

    expect(gotDeclined).toBe(false);
  });
});
