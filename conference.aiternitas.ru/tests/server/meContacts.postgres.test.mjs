/**
 * meContacts API tests with PostgreSQL persistence.
 * Covers POST /api/me/contacts flow that can fail with 500 on Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';
import { createToken } from '../../server/middleware/jwtAuth.mjs';

describe('meContacts with Postgres', () => {
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
      login: 'alice-pg-' + Date.now(),
      name: 'Alice',
      password: 'pass1234',
    });
    expect(regA.status).toBe(200);
    userAId = regA.body.subscriber.id;
    tokenA = createToken(userAId);

    const regB = await request.post('/api/auth/register').send({
      login: 'bob-pg-' + Date.now(),
      name: 'Bob',
      password: 'pass1234',
    });
    expect(regB.status).toBe(200);
    userBId = regB.body.subscriber.id;
    tokenB = createToken(userBId);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
    await pool.end();
  });

  it('POST /api/me/contacts creates contact request (no 500)', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ contactId: userBId });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request).toBeDefined();
    expect(res.body.request.fromId).toBe(userAId);
    expect(res.body.request.toId).toBe(userBId);
    expect(res.body.request.status).toBe('pending');
  });

  it('POST /api/me/contacts with contactId as login (lookup by login)', async () => {
    const regC = await request.post('/api/auth/register').send({
      login: 'charlie-login-' + Date.now(),
      name: 'Charlie',
      password: 'pass1234',
    });
    const charlieId = regC.body.subscriber.id;
    const charlieLogin = regC.body.subscriber.login || 'charlie-login-' + Date.now();

    const res = await request
      .post('/api/me/contacts')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ contactId: charlieLogin });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request.toId).toBe(charlieId);
  });

  it('GET /api/me/contacts returns list with Postgres', async () => {
    const res = await request
      .get('/api/me/contacts')
      .set('Authorization', 'Bearer ' + tokenA);
    expect(res.status).toBe(200);
    expect(res.body.contacts).toBeDefined();
  });

  it('rejects adding self', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ contactId: userAId });
    expect(res.status).toBe(400);
  });

  it('rejects unknown contact', async () => {
    const res = await request
      .post('/api/me/contacts')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ contactId: '99999' });
    expect(res.status).toBe(404);
  });
});
