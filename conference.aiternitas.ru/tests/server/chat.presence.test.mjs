/**
 * Unit-тесты для chat.mjs: registerSubscriberSocket, unregisterSocket, getSubscriberOnlineStatus.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerSubscriberSocket,
  unregisterSocket,
  getSubscriberOnlineStatus,
  getBulkPresenceStatus,
  getAllOnlineSubscriberIds,
} from '../../server/sockets/chat.mjs';

describe('chat presence (subscriberIdToSockets)', () => {
  const mockSocket = (id, data = {}) => ({ id, data });

  afterEach(() => {
    unregisterSocket('s1');
    unregisterSocket('s2');
    unregisterSocket('s3');
    unregisterSocket('s4');
  });

  it('registerSubscriberSocket adds socket and sets subscriberId', () => {
    const socket = mockSocket('s1');
    registerSubscriberSocket(socket, 'alice');
    expect(socket.data.subscriberId).toBe('alice');
    expect(getSubscriberOnlineStatus('alice')).toBe(true);
  });

  it('unregisterSocket removes socket and user becomes offline', () => {
    const socket = mockSocket('s1');
    registerSubscriberSocket(socket, 'alice');
    expect(getSubscriberOnlineStatus('alice')).toBe(true);
    unregisterSocket('s1');
    expect(getSubscriberOnlineStatus('alice')).toBe(false);
  });

  it('multi-tab: same subscriberId, two sockets - offline only when both disconnect', () => {
    const s1 = mockSocket('s1');
    const s2 = mockSocket('s2');
    registerSubscriberSocket(s1, 'alice');
    registerSubscriberSocket(s2, 'alice');
    expect(getSubscriberOnlineStatus('alice')).toBe(true);

    unregisterSocket('s1');
    expect(getSubscriberOnlineStatus('alice')).toBe(true);

    unregisterSocket('s2');
    expect(getSubscriberOnlineStatus('alice')).toBe(false);
  });

  it('getBulkPresenceStatus returns correct map', () => {
    const s1 = mockSocket('s1');
    const s2 = mockSocket('s2');
    registerSubscriberSocket(s1, 'alice');
    registerSubscriberSocket(s2, 'bob');
    const status = getBulkPresenceStatus(['alice', 'bob', 'carol']);
    expect(status.alice).toBe(true);
    expect(status.bob).toBe(true);
    expect(status.carol).toBe(false);
  });

  it('getAllOnlineSubscriberIds returns unique ids', () => {
    const s1 = mockSocket('s1');
    const s2 = mockSocket('s2');
    registerSubscriberSocket(s1, 'alice');
    registerSubscriberSocket(s2, 'alice');
    const ids = getAllOnlineSubscriberIds();
    expect(ids).toContain('alice');
    expect(ids).toHaveLength(1);
  });

  it('ignores empty or invalid subscriberId', () => {
    const socket = mockSocket('s1');
    registerSubscriberSocket(socket, '');
    expect(socket.data?.subscriberId).toBeUndefined();
    expect(getSubscriberOnlineStatus('')).toBe(false);

    registerSubscriberSocket(socket, null);
    expect(getSubscriberOnlineStatus(null)).toBe(false);
  });

  it('trims subscriberId', () => {
    const socket = mockSocket('s1');
    registerSubscriberSocket(socket, '  alice  ');
    expect(socket.data.subscriberId).toBe('alice');
    expect(getSubscriberOnlineStatus('alice')).toBe(true);
  });
});
