import { describe, it, expect } from 'vitest';

/**
 * Contract test: API response format must match what the app expects.
 * See app/(tabs)/index.tsx - connectVpn uses:
 *   config.interface.privateKey, config.peer.publicKey,
 *   config.serverAddress, config.serverPort, config.allowedIPs, config.dns,
 *   config.peer.endpoint
 */
describe('API contract: config response format', () => {
  it('POST /api/config/anon returns structure expected by app', async () => {
    const { POST } = await import('@/app/api/config/anon/route');
    const res = await POST(new Request('http://localhost/api/config/anon', { method: 'POST' }));
    expect(res.status).toBe(200);

    const data = await res.json();

    // App expects config.interface
    expect(data.interface).toBeDefined();
    expect(typeof data.interface.privateKey).toBe('string');
    expect(data.interface.privateKey.length).toBeGreaterThan(0);
    expect(typeof data.interface.address).toBe('string');
    expect(typeof data.interface.dns).toBe('string');

    // App expects config.peer
    expect(data.peer).toBeDefined();
    expect(typeof data.peer.publicKey).toBe('string');
    expect(typeof data.peer.endpoint).toBe('string');
    expect(data.peer.endpoint).toContain(':');

    // App uses config.serverAddress and config.serverPort
    expect(typeof data.serverAddress).toBe('string');
    expect(typeof data.serverPort).toBe('number');
    expect(data.serverPort).toBeGreaterThan(0);

    // App uses config.allowedIPs and config.dns
    expect(Array.isArray(data.allowedIPs)).toBe(true);
    expect(data.allowedIPs.length).toBeGreaterThan(0);
    expect(Array.isArray(data.dns)).toBe(true);
    expect(data.dns.length).toBeGreaterThan(0);

    // App displays config.peer.endpoint
    expect(data.peer.endpoint.length).toBeGreaterThan(0);

    // Connect logic: serverAddress || peer.endpoint.split(':')[0]
    const serverAddr = data.serverAddress || data.peer.endpoint.split(':')[0];
    expect(serverAddr).toBeDefined();
    expect(serverAddr.length).toBeGreaterThan(0);
  });
});
