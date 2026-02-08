import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-profile-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('me/profile API', () => {
  let app, server, io, request;
  const login = 'profile-user-' + Date.now();
  let userId;

  beforeAll(async () => {
    ({ app, server, io } = createServerApp({
      dataDir,
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    }));
    await new Promise((resolve) => server.listen(0, resolve));
    request = supertest(app);
    const reg = await request.post('/api/auth/register').send({
      login,
      name: 'Profile User',
      password: 'pass1234',
    });
    userId = reg.body.subscriber.id;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('GET /api/me/profile returns profile', async () => {
    const res = await request
      .get('/api/me/profile')
      .set('X-Subscriber-Id', userId);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.id).toBe(userId);
    expect(res.body.profile.name).toBe('Profile User');
  });

  it('GET /api/me/profile requires auth', async () => {
    const res = await request.get('/api/me/profile');
    expect(res.status).toBe(401);
  });

  it('PUT /api/me/profile updates name', async () => {
    const res = await request
      .put('/api/me/profile')
      .set('X-Subscriber-Id', userId)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.profile.name).toBe('Updated Name');
  });

  it('PUT /api/me/profile rejects empty name', async () => {
    const res = await request
      .put('/api/me/profile')
      .set('X-Subscriber-Id', userId)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/me/avatar rejects request without file', async () => {
    const res = await request
      .post('/api/me/avatar')
      .set('X-Subscriber-Id', userId);
    expect(res.status).toBe(400);
  });

  it('POST /api/me/avatar uploads avatar', async () => {
    // Create a tiny PNG file in memory
    const pngHeader = Buffer.from([
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

    const res = await request
      .post('/api/me/avatar')
      .set('X-Subscriber-Id', userId)
      .attach('avatar', pngHeader, 'test.png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.avatarUrl).toContain('/uploads/avatars/');
  });

  it('GET /api/me/profile returns avatarUrl after upload', async () => {
    const res = await request
      .get('/api/me/profile')
      .set('X-Subscriber-Id', userId);
    expect(res.status).toBe(200);
    expect(res.body.profile.avatarUrl).toContain('/uploads/avatars/');
  });
});
