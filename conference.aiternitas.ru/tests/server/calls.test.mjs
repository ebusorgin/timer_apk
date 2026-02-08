import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

const dataDir = path.join(os.tmpdir(), 'conf-calls-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('calls API', () => {
  let app;
  let server;
  let io;
  let request;
  let serverUrl;

  beforeAll(async () => {
    ({ app, server, io } = createServerApp({
      dataDir,
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    }));
    await new Promise((resolve) => server.listen(0, () => {
      const addr = server.address();
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    }));
    request = supertest(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('POST /api/calls creates audio call by default', async () => {
    await request.post('/api/subscribers').send({ id: 'caller1', name: 'Caller' });
    await request.post('/api/subscribers').send({ id: 'callee1', name: 'Callee' });

    const res = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'callee1',
        fromName: 'Caller',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.call).toMatchObject({
      from: { id: 'caller1', name: 'Caller' },
      to: { id: 'callee1', name: 'Callee' },
      callType: 'audio',
      status: 'pending',
    });
    expect(res.body.call.id).toBeDefined();
  });

  it('POST /api/calls creates video call with callType=video', async () => {
    const res = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'callee1',
        fromName: 'Caller',
        callType: 'video',
      });
    expect(res.status).toBe(200);
    expect(res.body.call.callType).toBe('video');
  });

  it('GET /api/calls/pending/:id returns 403 when subscriberId does not match auth', async () => {
    const res = await request.get('/api/calls/pending/callee2').set('X-Subscriber-Id', 'caller1');
    expect(res.status).toBe(403);
  });

  it('GET /api/calls/pending/:id returns pending calls', async () => {
    await request.post('/api/subscribers').send({ id: 'callee2', name: 'Callee2' });
    await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'callee2',
        fromName: 'Caller',
      });

    const res = await request.get('/api/calls/pending/callee2').set('X-Subscriber-Id', 'callee2');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.calls)).toBe(true);
    expect(res.body.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/calls/:id/ack updates status', async () => {
    await request.post('/api/subscribers').send({ id: 'callee3', name: 'Callee3' });
    const createRes = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'callee3',
        fromName: 'Caller',
      });
    const callId = createRes.body.call.id;

    const res = await request
      .post(`/api/calls/${callId}/ack`)
      .set('X-Subscriber-Id', 'callee3')
      .send({ status: 'acknowledged' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.call.status).toBe('acknowledged');
  });

  it('POST /api/calls returns 401 when not authenticated', async () => {
    await request.post('/api/subscribers').send({ id: 'callee4', name: 'Callee4' });
    const res = await request.post('/api/calls').send({
      toId: 'callee4',
      fromName: 'Fake',
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/calls returns 401 when X-Subscriber-Id is unknown (auth middleware rejects)', async () => {
    await request.post('/api/subscribers').send({ id: 'callee4b', name: 'Callee4b' });
    const res = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'unknown-caller')
      .send({
        toId: 'callee4b',
        fromName: 'Fake',
      });
    expect(res.status).toBe(401);
  });

  it('POST /api/calls rejects when toId not registered', async () => {
    const res = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'unknown-callee',
        fromName: 'Caller',
      });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Получатель');
  });

  it('POST /api/calls/:id/ack returns 403 when user is not a participant', async () => {
    await request.post('/api/subscribers').send({ id: 'stranger', name: 'Stranger' });
    const createRes = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({ toId: 'callee1', fromName: 'Caller' });
    const callId = createRes.body.call.id;
    const res = await request
      .post(`/api/calls/${callId}/ack`)
      .set('X-Subscriber-Id', 'stranger')
      .send({ status: 'acknowledged' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/calls/:id/ack returns 404 for non-existent callId', async () => {
    const res = await request
      .post('/api/calls/call_999999999_nonexist/ack')
      .set('X-Subscriber-Id', 'caller1')
      .send({ status: 'acknowledged' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/calls rejects missing toId', async () => {
    const res = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        fromName: 'Caller',
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/calls/:id/ack accepts declined status', async () => {
    await request.post('/api/subscribers').send({ id: 'callee6', name: 'Callee6' });
    const createRes = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({
        toId: 'callee6',
        fromName: 'Caller',
      });
    const callId = createRes.body.call.id;
    const res = await request
      .post(`/api/calls/${callId}/ack`)
      .set('X-Subscriber-Id', 'callee6')
      .send({ status: 'declined' });
    expect(res.status).toBe(200);
    expect(res.body.call.status).toBe('declined');
  });

  it('call:ack with acknowledged is emitted to caller when callee accepts (push Accept flow)', async () => {
    await request.post('/api/subscribers').send({ id: 'caller1', name: 'Caller' });
    await request.post('/api/subscribers').send({ id: 'callee-push', name: 'CalleePush' });
    const caller = ioClient(serverUrl, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
      auth: { subscriberId: 'caller1' },
    });
    const ackPromise = new Promise((resolve) => {
      caller.once('call:ack', (data) => resolve(data));
    });
    await new Promise((r, e) => {
      caller.once('connect', r);
      caller.once('connect_error', e);
    });

    const createRes = await request
      .post('/api/calls')
      .set('X-Subscriber-Id', 'caller1')
      .send({ toId: 'callee-push', fromName: 'Caller' });
    const callId = createRes.body.call.id;

    await request
      .post(`/api/calls/${callId}/ack`)
      .set('X-Subscriber-Id', 'callee-push')
      .send({ status: 'acknowledged' });

    const ack = await Promise.race([
      ackPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('call:ack timeout')), 2000)),
    ]);
    caller.disconnect();
    expect(ack.status).toBe('acknowledged');
    expect(ack.callId).toBe(callId);
    expect(ack.call?.status).toBe('acknowledged');
  });
});
