import { afterEach, describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';
import { getSessionSecret, getTrustedProxyRanges } from '../server/security.js';

afterEach(() => vi.unstubAllEnvs());

describe('production session configuration', () => {
  it('rejects missing, short and development session secrets in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const secret of ['', 'too-short', 'a_very_long_secret_key_that_is_at_least_32_chars_long!']) {
      vi.stubEnv('SESSION_SECRET', secret);
      expect(getSessionSecret).toThrow(/unique SESSION_SECRET/);
    }
  });
  it('uses a configured production secret without changing it', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const secret = 'test-only-production-secret-with-at-least-32-characters';
    vi.stubEnv('SESSION_SECRET', secret);
    expect(getSessionSecret()).toBe(secret);
  });
});

describe('forwarded header trust', () => {
  it('rejects spoofed forwarded headers from a direct public client', async () => {
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('TRUSTED_PROXY_CIDRS', '');
    const app = fastify({ trustProxy: getTrustedProxyRanges() });
    app.get('/', request => ({ ip: request.ip, protocol: request.protocol, host: request.host }));
    try {
      const response = await app.inject({ url: '/', remoteAddress: '203.0.113.9', headers: {
        host: 'satori.example', 'x-forwarded-for': '192.0.2.99',
        'x-forwarded-proto': 'https', 'x-forwarded-host': 'attacker.example',
      }});
      expect(response.json()).toEqual({ ip: '203.0.113.9', protocol: 'http', host: 'satori.example' });
    } finally { await app.close(); }
  });
  it('accepts HTTPS metadata from the internal Render proxy but stops at the public client', async () => {
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('TRUSTED_PROXY_CIDRS', '');
    const app = fastify({ trustProxy: getTrustedProxyRanges() });
    app.get('/', request => ({ ip: request.ip, protocol: request.protocol }));
    try {
      const response = await app.inject({ url: '/', remoteAddress: '10.0.0.2', headers: {
        'x-forwarded-for': '192.0.2.99, 203.0.113.9', 'x-forwarded-proto': 'https',
      }});
      expect(response.json()).toEqual({ ip: '203.0.113.9', protocol: 'https' });
    } finally { await app.close(); }
  });
});
