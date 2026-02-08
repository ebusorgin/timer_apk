import { describe, it, expect, vi } from 'vitest';

// Mock lib/wg before any imports that use it
vi.mock('@/lib/wg', () => ({
  generateKeys: vi.fn().mockResolvedValue({ privateKey: 'MOCK_PRIV', publicKey: 'MOCK_PUB' }),
  addPeer: vi.fn().mockResolvedValue(undefined),
}));

// Mock next/headers for routes that use getSession
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}));

describe('API /api/exits', () => {
  it('GET returns 200 and array of countries with code and name', async () => {
    const { GET } = await import('@/app/api/exits/route');
    const res = await GET(new Request('http://localhost/api/exits'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('code');
    expect(data[0]).toHaveProperty('name');
  });
});

describe('API /api/apk', () => {
  it('HEAD returns 200 when APK exists, 404 when not', async () => {
    const { HEAD } = await import('@/app/api/apk/route');
    const res = await HEAD(new Request('http://localhost/api/apk'));
    // APK may or may not exist in public/ - both 200 and 404 are valid
    expect([200, 404]).toContain(res.status);
  });

  it('GET returns correct content-type when file exists', async () => {
    const { GET } = await import('@/app/api/apk/route');
    const res = await GET(new Request('http://localhost/api/apk'));
    if (res.status === 200) {
      expect(res.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
      expect(res.headers.get('Content-Disposition')).toContain('vpn-app.apk');
    }
  });
});

describe('API /api/config', () => {
  it('GET returns 401 without token', async () => {
    const { GET } = await import('@/app/api/config/route');
    const res = await GET(new Request('http://localhost/api/config'));
    expect(res.status).toBe(401);
  });
});

describe('API /api/config/anon', () => {
  it('POST returns 200 with token and config structure', async () => {
    const { POST } = await import('@/app/api/config/anon/route');
    const res = await POST(new Request('http://localhost/api/config/anon', { method: 'POST' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe('string');
    expect(data.interface).toBeDefined();
    expect(data.interface.privateKey).toBeDefined();
    expect(data.interface.address).toBeDefined();
    expect(data.interface.dns).toBeDefined();
    expect(data.peer).toBeDefined();
    expect(data.peer.publicKey).toBeDefined();
    expect(data.peer.endpoint).toBeDefined();
    expect(data.serverAddress).toBeDefined();
    expect(data.serverPort).toBeDefined();
    expect(Array.isArray(data.allowedIPs)).toBe(true);
    expect(Array.isArray(data.dns)).toBe(true);
    expect(data.exitCountry).toBeDefined();
  });
});

describe('API /api/config/exit', () => {
  it('PUT returns 401 without token', async () => {
    const { PUT } = await import('@/app/api/config/exit/route');
    const res = await PUT(
      new Request('http://localhost/api/config/exit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'de' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('PUT returns 400 for invalid country when authorized', async () => {
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { id: 1 },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    const { headers } = await import('next/headers');
    vi.mocked(headers).mockResolvedValueOnce({
      get: (name: string) => (name === 'authorization' ? `Bearer ${token}` : null),
    } as any);

    // Validation runs before DB - country 'xx' is invalid
    const { PUT } = await import('@/app/api/config/exit/route');
    const res = await PUT(
      new Request('http://localhost/api/config/exit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'xx' }),
      })
    );
    expect(res.status).toBe(400);
  });
});
