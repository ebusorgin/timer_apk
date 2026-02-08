/**
 * Web API tests: register, login, contacts, build message.
 * Set DB_PATH before app loads so tests use a separate DB.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(__dirname, '..', 'data', 'web-test.db');
}

import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../server/app.mjs';

const testUsername = `testuser_${Date.now()}`;
const testPassword = 'password123';

describe('web API', () => {
  it('POST /api/auth/register returns token and userId', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: testUsername, password: testPassword });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.token);
    assert.ok(res.body.userId && res.body.userId.length >= 32);
    assert.ok(res.body.boxPublicKey);
  });

  it('POST /api/auth/login returns token for valid user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.ok(res.body.userId);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: 'wrong' });
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/contacts requires auth', async () => {
    const res = await request(app).get('/api/contacts');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/contacts returns list with token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    const token = loginRes.body.token;
    const res = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.contacts));
  });

  it('POST /api/contacts adds contact', async () => {
    const { createIdentity, signKeypairToBox } = await import('../shared/crypto.mjs');
    const other = await createIdentity();
    const nodeId = other.userId;
    const boxKey = Buffer.from(signKeypairToBox(other).publicKey).toString('base64');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    const token = loginRes.body.token;
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeId, boxPublicKey: boxKey, name: 'Alice' });
    assert.strictEqual(res.status, 201);
    const listRes = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`);
    const found = listRes.body.contacts.find((c) => c.nodeId === nodeId);
    assert.ok(found);
    assert.strictEqual(found.name, 'Alice');
  });

  it('POST /api/messages/build returns message when contact exists', async () => {
    const { createIdentity, signKeypairToBox } = await import('../shared/crypto.mjs');
    const other = await createIdentity();
    const nodeId = other.userId;
    const boxKey = Buffer.from(signKeypairToBox(other).publicKey).toString('base64');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    const token = loginRes.body.token;
    await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeId, boxPublicKey: boxKey, name: 'Bob' });
    const res = await request(app)
      .post('/api/messages/build')
      .set('Authorization', `Bearer ${token}`)
      .send({ plaintext: 'Hello', receiverId: nodeId, ttl_seconds: 3600 });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message_id);
    assert.strictEqual(res.body.sender_id, loginRes.body.userId);
    assert.strictEqual(res.body.receiver_id, nodeId);
  });

  it('GET /api/messages returns decrypted list with token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    const token = loginRes.body.token;
    const res = await request(app)
      .get('/api/messages')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
  });
});
