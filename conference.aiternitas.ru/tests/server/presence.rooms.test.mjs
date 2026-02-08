import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { createServerApp } from '../../server/app.mjs';

describe('presence room scope', () => {
  let server;
  let io;
  let address;

  beforeAll(async () => {
    const appFactory = createServerApp({
      guardrails: { rateLimit: false, auth: false },
      logLevel: 'error',
    });
    ({ server, io } = appFactory);
    await new Promise((resolve) => {
      const listener = server.listen(0, () => {
        address = listener.address();
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('presence:sync contains only room participants', async () => {
    const url = `http://127.0.0.1:${address.port}`;
    const clientA = ioClient(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });
    const clientB = ioClient(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      clientA.once('connect', resolve);
      clientA.once('connect_error', reject);
    });
    await new Promise((resolve, reject) => {
      clientB.once('connect', resolve);
      clientB.once('connect_error', reject);
    });

    const syncA = new Promise((resolve) => {
      clientA.once('presence:sync', resolve);
    });
    const syncB = new Promise((resolve) => {
      clientB.once('presence:sync', resolve);
    });

    clientA.emit('room:join', { roomId: 'room-alpha', displayName: 'A' });
    clientB.emit('room:join', { roomId: 'room-beta', displayName: 'B' });

    const dataA = await syncA;
    const dataB = await syncB;

    expect(dataA.roomId).toBe('room-alpha');
    expect(dataB.roomId).toBe('room-beta');
    expect(dataA.participants).toHaveLength(1);
    expect(dataB.participants).toHaveLength(1);
    expect(dataA.participants[0].id).toBe(clientA.id);
    expect(dataB.participants[0].id).toBe(clientB.id);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('participants in same room see each other', async () => {
    const url = `http://127.0.0.1:${address.port}`;
    const clientA = ioClient(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });
    const clientB = ioClient(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise((r, e) => { clientA.once('connect', r); clientA.once('connect_error', e); }),
      new Promise((r, e) => { clientB.once('connect', r); clientB.once('connect_error', e); }),
    ]);

    const updateA = new Promise((resolve) => {
      clientA.once('presence:update', (d) => {
        if (d.action === 'join') resolve(d);
      });
    });

    clientA.emit('room:join', { roomId: 'shared2', displayName: 'A' });
    await new Promise((r) => setTimeout(r, 80));
    clientB.emit('room:join', { roomId: 'shared2', displayName: 'B' });

    const update = await updateA;
    expect(update.action).toBe('join');
    expect(update.participant.id).toBe(clientB.id);

    clientA.disconnect();
    clientB.disconnect();
  }, 10000);
});
