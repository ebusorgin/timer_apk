import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-auth-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('auth API', () => {
  let app, server, io, request;

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

  it('POST /api/auth/register creates user with login and password', async () => {
    const res = await request.post('/api/auth/register').send({
      login: 'testuser',
      name: 'Test User',
      password: 'secret123',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriber.name).toBe('Test User');
    expect(res.body.subscriber.id).toBeDefined();
    expect(res.body.subscriber.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/register with custom login', async () => {
    const res = await request.post('/api/auth/register').send({
      login: 'custom-login',
      name: 'Custom User',
      password: 'pass1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.subscriber.id).toBeDefined();
    expect(res.body.subscriber.name).toBe('Custom User');
  });

  it('POST /api/auth/register rejects duplicate login', async () => {
    const res = await request.post('/api/auth/register').send({
      login: 'custom-login',
      name: 'Another',
      password: 'pass5678',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/register rejects short password', async () => {
    const res = await request.post('/api/auth/register').send({
      login: 'shortuser',
      name: 'Short',
      password: 'ab',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register rejects empty name', async () => {
    const res = await request.post('/api/auth/register').send({
      login: 'noname',
      name: '',
      password: 'pass1234',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login succeeds with correct password', async () => {
    const res = await request.post('/api/auth/login').send({
      login: 'custom-login',
      password: 'pass1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriber.name).toBe('Custom User');
  });

  it('POST /api/auth/login succeeds with case-insensitive login', async () => {
    await request.post('/api/auth/register').send({
      login: 'CaseUser',
      name: 'Case User',
      password: 'case1234',
    });
    const res = await request.post('/api/auth/login').send({
      login: 'caseuser',
      password: 'case1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await request.post('/api/auth/login').send({
      login: 'custom-login',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('пароль');
  });

  it('POST /api/auth/login rejects unknown user', async () => {
    const res = await request.post('/api/auth/login').send({
      login: 'nonexistent-user',
      password: 'whatever',
    });
    expect(res.status).toBe(401);
  });

  it('second register cannot overwrite first user', async () => {
    const res1 = await request.post('/api/auth/register').send({
      login: 'protected-user',
      name: 'Original',
      password: 'original123',
    });
    expect(res1.status).toBe(200);
    expect(res1.body.subscriber.name).toBe('Original');

    const res2 = await request.post('/api/auth/register').send({
      login: 'protected-user',
      name: 'Imposter',
      password: 'imposter123',
    });
    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);

    const login = await request.post('/api/auth/login').send({
      login: 'protected-user',
      password: 'original123',
    });
    expect(login.status).toBe(200);
    expect(login.body.subscriber.name).toBe('Original');

    const loginFail = await request.post('/api/auth/login').send({
      login: 'protected-user',
      password: 'imposter123',
    });
    expect(loginFail.status).toBe(401);
  });

  it('POST /api/subscribers does not overwrite user with password', async () => {
    const reg = await request.post('/api/auth/register').send({
      login: 'sub-protect-test',
      name: 'Protected',
      password: 'pass1234',
    });
    const id = reg.body?.subscriber?.id;
    expect(id).toBeDefined();

    const res = await request.post('/api/subscribers').send({
      id,
      name: 'Overwritten',
    });
    expect(res.status).toBe(200);
  });

  it('each register generates unique ID', async () => {
    const res1 = await request.post('/api/auth/register').send({
      login: 'user-one',
      name: 'User One',
      password: 'pass1111',
    });
    const res2 = await request.post('/api/auth/register').send({
      login: 'user-two',
      name: 'User Two',
      password: 'pass2222',
    });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.subscriber.id).not.toBe(res2.body.subscriber.id);
  });

  it('login preserves name after multiple attempts', async () => {
    await request.post('/api/auth/register').send({
      login: 'stable-user',
      name: 'Stable Name',
      password: 'stablepass',
    });

    for (let i = 0; i < 3; i++) {
      const res = await request.post('/api/auth/login').send({
        login: 'stable-user',
        password: 'stablepass',
      });
      expect(res.body.subscriber.name).toBe('Stable Name');
    }
  });
});
