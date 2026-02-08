import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

describe('rooms API', () => {
  let app;
  let server;
  let io;
  let request;
  let address;

  beforeAll(async () => {
    ({ app, server, io } = createServerApp({
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    }));
    await new Promise((resolve) => {
      const listener = server.listen(0, () => {
        address = listener.address();
        resolve();
      });
    });
    request = supertest(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('GET /api/rooms returns rooms', async () => {
    const res = await request.get('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.rooms)).toBe(true);
  });

  it('GET /api/rooms shows active rooms after join', async () => {
    const client = ioClient(`http://127.0.0.1:${address.port}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    client.emit('room:join', { roomId: 'test-room-1', displayName: 'User1' });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await request.get('/api/rooms');
    expect(res.status).toBe(200);
    const room = res.body.rooms.find((r) => r.roomId === 'test-room-1');
    expect(room).toBeDefined();
    expect(room.participantCount).toBe(1);

    client.disconnect();
  });
});
