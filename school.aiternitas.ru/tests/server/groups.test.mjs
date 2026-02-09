import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createMockPersistence } from './mockPersistence.mjs';
import { createTestApp } from './createTestApp.mjs';

describe('Groups and programs', () => {
  const persistence = createMockPersistence();
  const app = createTestApp(persistence);

  it('GET /api/programs/1/groups returns groups', async () => {
    const res = await request(app).get('/api/programs/1/groups');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.groups));
    assert.ok(res.body.groups.length >= 1);
    assert.strictEqual(res.body.groups[0].programId, '1');
    assert.ok(res.body.groups[0].schedule);
  });

  it('GET /api/programs/999/groups returns empty array', async () => {
    const res = await request(app).get('/api/programs/999/groups');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.groups));
    assert.strictEqual(res.body.groups.length, 0);
  });
});
