import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createToken } from '../../server/middleware/jwtAuth.mjs';
import { createMockPersistence } from './mockPersistence.mjs';
import { createTestApp } from './createTestApp.mjs';

describe('Me routes', () => {
  const persistence = createMockPersistence();
  const app = createTestApp(persistence);

  it('GET /api/me returns 401 without auth', async () => {
    const res = await request(app).get('/api/me');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/me returns user with valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@test.com', name: 'Me User', password: 'pass1234' });
    const token = reg.body.token;
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.email, 'me@test.com');
    assert.strictEqual(res.body.user.name, 'Me User');
  });

  it('PUT /api/me/profile returns 401 without auth', async () => {
    const res = await request(app).put('/api/me/profile').send({ name: 'New Name' });
    assert.strictEqual(res.status, 401);
  });

  it('PUT /api/me/profile returns 400 when name missing', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'profile@test.com', name: 'Old', password: 'pass1234' });
    const res = await request(app)
      .put('/api/me/profile')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({});
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/me/profile updates name', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'profile2@test.com', name: 'Old Name', password: 'pass1234' });
    const token = reg.body.token;
    const res = await request(app)
      .put('/api/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.name, 'Updated Name');
  });

  it('GET /api/me/enrollments returns empty for new user', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'enroll1@test.com', name: 'Enroll', password: 'pass1234' });
    const res = await request(app)
      .get('/api/me/enrollments')
      .set('Authorization', `Bearer ${reg.body.token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.enrollments));
    assert.strictEqual(res.body.enrollments.length, 0);
  });

  it('POST /api/me/enrollments enrolls user in program', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'enroll2@test.com', name: 'Enroll', password: 'pass1234' });
    const token = reg.body.token;
    const enrollRes = await request(app)
      .post('/api/me/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: '1' });
    assert.strictEqual(enrollRes.status, 200);
    assert.strictEqual(enrollRes.body.success, true);
    const listRes = await request(app)
      .get('/api/me/enrollments')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(listRes.body.enrollments.length, 1);
    assert.strictEqual(listRes.body.enrollments[0].programId, '1');
  });

  it('GET /api/me/homework returns array', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'hw@test.com', name: 'HW', password: 'pass1234' });
    const res = await request(app)
      .get('/api/me/homework')
      .set('Authorization', `Bearer ${reg.body.token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.homework));
  });

  it('GET /api/me/announcements returns array', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'ann@test.com', name: 'Ann', password: 'pass1234' });
    const res = await request(app)
      .get('/api/me/announcements')
      .set('Authorization', `Bearer ${reg.body.token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.announcements));
  });
});
