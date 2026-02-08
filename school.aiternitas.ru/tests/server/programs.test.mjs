import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createMockPersistence } from './mockPersistence.mjs';
import { createTestApp } from './createTestApp.mjs';

describe('Programs routes', () => {
  const persistence = createMockPersistence();
  const app = createTestApp(persistence);

  it('GET /api/programs returns programs', async () => {
    const res = await request(app).get('/api/programs');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.programs));
  });

  it('GET /api/programs/meta/school-types returns school types', async () => {
    const res = await request(app).get('/api/programs/meta/school-types');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.schoolTypes));
    assert.ok(res.body.schoolTypes.length >= 2);
  });

  it('GET /api/programs/meta/directions returns directions', async () => {
    const res = await request(app).get('/api/programs/meta/directions');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.directions));
  });

  it('GET /api/programs/:id returns program', async () => {
    const res = await request(app).get('/api/programs/1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.program.id, '1');
    assert.strictEqual(res.body.program.title, 'Test Program');
  });

  it('GET /api/programs/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/programs/99999');
    assert.strictEqual(res.status, 404);
  });
});
