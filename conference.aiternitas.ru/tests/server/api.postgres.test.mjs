/**
 * API integration tests with PostgreSQL persistence.
 * Ensures all main routes work correctly with Postgres (no 500 errors).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';
import { createToken } from '../../server/middleware/jwtAuth.mjs';

describe('API with Postgres', () => {
  let app;
  let server;
  let io;
  let request;
  let pool;
  let userAId;
  let userBId;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    const db = newDb();
    const pg = db.adapters.createPg();
    pool = new pg.Pool();

    ({ app, server, io } = createServerApp({
      guardrails: { rateLimit: false, auth: false },
      persistenceOptions: {
        driver: 'postgres',
        poolInstance: pool,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      },
      logLevel: 'error',
    }));

    await new Promise((resolve) => server.listen(0, resolve));
    request = supertest(app);

    const regA = await request.post('/api/auth/register').send({
      login: 'alice-api-' + Date.now(),
      name: 'Alice',
      password: 'pass1234',
    });
    expect(regA.status).toBe(200);
    userAId = regA.body.subscriber.id;
    tokenA = createToken(userAId);

    const regB = await request.post('/api/auth/register').send({
      login: 'bob-api-' + Date.now(),
      name: 'Bob',
      password: 'pass1234',
    });
    expect(regB.status).toBe(200);
    userBId = regB.body.subscriber.id;
    tokenB = createToken(userBId);

    const auth = (token) => ({ Authorization: 'Bearer ' + token });
    const addRes = await request.post('/api/me/contacts').set(auth(tokenA)).send({ contactId: userBId });
    const reqId = addRes.body?.request?.id;
    if (reqId) {
      await request.post(`/api/me/contacts/requests/${reqId}/accept`).set(auth(tokenB));
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
    await pool.end();
  });

  const auth = (token) => ({ Authorization: 'Bearer ' + token });

  describe('me/profile', () => {
    it('GET returns profile', async () => {
      const res = await request.get('/api/me/profile').set(auth(tokenA));
      expect(res.status).toBe(200);
      expect(res.body.profile.id).toBe(userAId);
      expect(res.body.profile.name).toBe('Alice');
    });

    it('PUT updates name', async () => {
      const res = await request.put('/api/me/profile').set(auth(tokenA)).send({ name: 'Alice Updated' });
      expect(res.status).toBe(200);
      expect(res.body.profile.name).toBe('Alice Updated');
    });
  });

  describe('me/messages', () => {
    it('POST sends message between contacts', async () => {
      const res = await request
        .post('/api/me/messages')
        .set(auth(tokenA))
        .send({ toId: userBId, body: 'Hello from Postgres!' });
      expect(res.status).toBe(200);
      expect(res.body.message.fromId).toBe(userAId);
      expect(res.body.message.toId).toBe(userBId);
      expect(res.body.message.body).toBe('Hello from Postgres!');
    });

    it('GET returns messages', async () => {
      const res = await request
        .get('/api/me/messages?contactId=' + userBId)
        .set(auth(tokenA));
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calls', () => {
    it('POST creates call', async () => {
      const res = await request
        .post('/api/calls')
        .set(auth(tokenA))
        .send({ toId: userBId, fromName: 'Alice', callType: 'audio' });
      expect(res.status).toBe(200);
      expect(res.body.call.from.id).toBe(userAId);
      expect(res.body.call.to.id).toBe(userBId);
      expect(res.body.call.status).toBe('pending');
    });

    it('GET pending returns calls for callee', async () => {
      const res = await request.get('/api/calls/pending/' + userBId).set(auth(tokenB));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.calls)).toBe(true);
    });
  });
});
