import { afterEach, describe, it } from 'node:test';
import { expect } from './expect.js';
import fastify from 'fastify';
import { getSessionSecret, getTrustedProxyRanges } from '../server/security.js';

const original = { ...process.env };
afterEach(() => {
  for (const key of ['NODE_ENV','SESSION_SECRET','RENDER','TRUSTED_PROXY_CIDRS']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('production session configuration', () => {
  it('rejects missing, short and development session secrets in production', () => {
    process.env.NODE_ENV = 'production';
    for (const secret of ['', 'too-short', 'a_very_long_secret_key_that_is_at_least_32_chars_long!']) {
      process.env.SESSION_SECRET = secret;
      expect(getSessionSecret).toThrow(/unique SESSION_SECRET/);
    }
  });
  it('uses a configured production secret without changing it', () => {
    process.env.NODE_ENV = 'production';
    const secret = 'test-only-production-secret-with-at-least-32-characters';
    process.env.SESSION_SECRET = secret;
    expect(getSessionSecret()).toBe(secret);
  });
});

describe('forwarded header trust', () => {
  it('rejects spoofed forwarded headers from a direct public client', async () => {
    process.env.RENDER = 'true';
    process.env.TRUSTED_PROXY_CIDRS = '';
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
    process.env.RENDER = 'true';
    process.env.TRUSTED_PROXY_CIDRS = '';
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
