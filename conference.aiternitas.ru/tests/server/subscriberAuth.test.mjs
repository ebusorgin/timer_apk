import { describe, expect, it } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createSubscriberAuthMiddleware } from '../../server/middleware/subscriberAuth.mjs';

describe('subscriberAuth middleware', () => {
  const createApp = (getSubscriberById) => {
    const app = express();
    app.use(express.json());
    const auth = createSubscriberAuthMiddleware({ getSubscriberById });
    app.get('/protected', auth, (req, res) => {
      res.json({ success: true, subscriberId: req.subscriberId });
    });
    return app;
  };

  it('throws if persistence is missing', () => {
    expect(() => createSubscriberAuthMiddleware(null)).toThrow('persistence');
  });

  it('throws if getSubscriberById is missing', () => {
    expect(() => createSubscriberAuthMiddleware({})).toThrow('getSubscriberById');
  });

  it('returns 401 when X-Subscriber-Id header is missing', async () => {
    const getSubscriberById = async () => ({ id: 'u1', name: 'User' });
    const app = createApp(getSubscriberById);
    const res = await supertest(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SUBSCRIBER_REQUIRED');
  });

  it('returns 401 when X-Subscriber-Id is empty', async () => {
    const getSubscriberById = async () => ({ id: 'u1', name: 'User' });
    const app = createApp(getSubscriberById);
    const res = await supertest(app).get('/protected').set('X-Subscriber-Id', '');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SUBSCRIBER_REQUIRED');
  });

  it('returns 401 when subscriber not found', async () => {
    const getSubscriberById = async (id) => (id === 'known' ? { id: 'known', name: 'Known' } : null);
    const app = createApp(getSubscriberById);
    const res = await supertest(app).get('/protected').set('X-Subscriber-Id', 'unknown');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SUBSCRIBER_NOT_FOUND');
  });

  it('calls next() and sets req.subscriberId when subscriber exists', async () => {
    const getSubscriberById = async (id) => (id === 'user-123' ? { id: 'user-123', name: 'Test' } : null);
    const app = createApp(getSubscriberById);
    const res = await supertest(app).get('/protected').set('X-Subscriber-Id', 'user-123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriberId).toBe('user-123');
  });

  it('trims whitespace from header value', async () => {
    const getSubscriberById = async (id) => (id === 'trimmed' ? { id: 'trimmed', name: 'Trimmed' } : null);
    const app = createApp(getSubscriberById);
    const res = await supertest(app).get('/protected').set('X-Subscriber-Id', '  trimmed  ');
    expect(res.status).toBe(200);
    expect(res.body.subscriberId).toBe('trimmed');
  });
});
