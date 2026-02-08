import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createMockPersistence } from './mockPersistence.mjs';
import { createTestApp } from './createTestApp.mjs';

describe('Auth routes', () => {
  const persistence = createMockPersistence();
  const app = createTestApp(persistence);

  it('POST /api/auth/register returns 400 when fields missing', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  it('POST /api/auth/register creates user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', name: 'Test User', password: 'test1234' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, 'test@test.com');
    assert.strictEqual(res.body.user.name, 'Test User');
    assert.strictEqual(res.body.user.role, 'student');
  });

  it('POST /api/auth/register returns 409 for duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', name: 'First', password: 'pass1234' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', name: 'Second', password: 'pass5678' });
    assert.strictEqual(res.status, 409);
  });

  it('POST /api/auth/login returns 400 when fields missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/auth/login returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', name: 'Login', password: 'correct' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrong' });
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/auth/login returns token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'correct' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, 'login@test.com');
  });
});
