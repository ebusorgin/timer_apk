import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createToken } from '../../server/middleware/jwtAuth.mjs';
import { createMockPersistence } from './mockPersistence.mjs';
import { createTestApp } from './createTestApp.mjs';

describe('Admin routes', () => {
  const persistence = createMockPersistence();
  const app = createTestApp(persistence);

  it('GET /api/admin/enrollments returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/enrollments');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/admin/enrollments returns 401 for student token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'student@test.com', name: 'Student', password: 'pass1234' });
    const res = await request(app)
      .get('/api/admin/enrollments')
      .set('Authorization', `Bearer ${reg.body.token}`);
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/admin/enrollments returns list for admin', async () => {
    const admin = await persistence.insertUser({ email: 'admin@test.com', name: 'Admin', passwordHash: 'x', role: 'admin' });
    const token = createToken(admin.id);
    const res = await request(app)
      .get('/api/admin/enrollments')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.enrollments));
  });

  it('GET /api/admin/groups returns groups', async () => {
    const admin = await persistence.insertUser({ email: 'admin2@test.com', name: 'Admin', passwordHash: 'x', role: 'admin' });
    const token = createToken(admin.id);
    const res = await request(app)
      .get('/api/admin/groups')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.groups));
  });

  it('POST /api/admin/announcements creates announcement', async () => {
    const admin = await persistence.insertUser({ email: 'admin3@test.com', name: 'Admin', passwordHash: 'x', role: 'admin' });
    const token = createToken(admin.id);
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: '1', title: 'Test Announcement', body: 'Body text' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.announcement);
    assert.strictEqual(res.body.announcement.title, 'Test Announcement');
  });

  it('POST /api/admin/announcements returns 400 when no group or program', async () => {
    const admin = await persistence.insertUser({ email: 'admin4@test.com', name: 'Admin', passwordHash: 'x', role: 'admin' });
    const token = createToken(admin.id);
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'No target', body: 'Body' });
    assert.strictEqual(res.status, 400);
  });
});
