import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createDb, initTables, AppDatabase } from '../db/client.js';
import { buildApp, getSessionConfig } from '../server/app.js';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Fastify API Routes & Auth', () => {
  let db: AppDatabase;
  let app: FastifyInstance;
  let dbFile: string;

  beforeEach(async () => {
    const testPassword = 'matrix_password';
    process.env.PORTAL_PASSWORD_HASH = await bcrypt.hash(testPassword, 10);
    dbFile = path.join(os.tmpdir(), `test_api_${Math.random().toString(36).substring(7)}.db`);
    db = createDb(`file:${dbFile}`);
    await initTables(db);
    app = buildApp(db);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    [dbFile, `${dbFile}-journal`, `${dbFile}-wal`].forEach((file) => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) {}
      }
    });
  });

  // RESTORED HEALTH TESTS
  it('returns health payload JSON with build stamp on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.build).toBeDefined();
    expect(body.build.gitSha).toBeDefined();
  });

  it('returns 200 OK on /health/ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
  });

  // NEW AUTH TESTS

  it('POST /api/login with the correct password returns 200 and a Set-Cookie header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'matrix_password' },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(Array.isArray(setCookie) ? setCookie.length : 1).toBeGreaterThan(0);
  });

  it('POST /api/login with a wrong password returns 401 and no Set-Cookie header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'wrong_password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /api/today with no cookie returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today' });
    expect(res.statusCode).toBe(401);
  });

  it('Cookie attributes: httpOnly, SameSite=Lax, and Secure based on NODE_ENV', async () => {
    // Test DEV environment - assert real header
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    let devApp = buildApp(db);
    await devApp.ready();
    const resDev = await devApp.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const rawCookiesDev = resDev.headers['set-cookie'];
    const cookieStrDev = Array.isArray(rawCookiesDev) ? rawCookiesDev[0] : (rawCookiesDev as string);
    expect(cookieStrDev).toContain('HttpOnly');
    expect(cookieStrDev).toContain('SameSite=Lax');
    expect(cookieStrDev).not.toContain('Secure');
    await devApp.close();

    // Test PROD environment - decouple from proxy by asserting the config directly
    process.env.NODE_ENV = 'production';
    const prodConfig = getSessionConfig();
    expect(prodConfig.secure).toBe(true);

    process.env.NODE_ENV = origEnv;
  });

  it('Rate limit bypass prevention: spoofed X-Forwarded-For IPs hit the same bucket', async () => {
    // Simulate an attacker sending forged IPs, but the real proxy appends the real client IP (203.0.113.1)
    // 5 allowed requests, each with a DIFFERENT forged IP at the start of the list
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ 
        method: 'POST', 
        url: '/api/login', 
        payload: { password: 'wrong' },
        headers: { 'x-forwarded-for': `192.168.1.${i}, 203.0.113.1` }
      });
      expect(res.statusCode).toBe(401);
    }
    // 6th request with yet another forged IP should STILL be rate limited (429) because the real IP is the same
    const res6 = await app.inject({ 
      method: 'POST', 
      url: '/api/login', 
      payload: { password: 'wrong' },
      headers: { 'x-forwarded-for': `192.168.1.100, 203.0.113.1` }
    });
    expect(res6.statusCode).toBe(429);
  });

  it('Rate limit: 6 POSTs to /api/login inside the window returns 429 on the 6th', async () => {
    // 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } });
      expect(res.statusCode).toBe(401); // wrong password but not rate limited yet
    }
    // 6th request should be rate limited
    const res6 = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } });
    expect(res6.statusCode).toBe(429);
  });

  it('rejects POST /api/tasks with text over MAX_TASK_LENGTH (R28)', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];
    
    const longText = 'a'.repeat(201);
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { text: longText, type: 'have_to' }
    });
    
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toContain('maximum length');
  });

  it('rejects PATCH /api/tasks/:id with text over MAX_TASK_LENGTH (R28)', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];
    
    const longText = 'a'.repeat(201);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/fake-id',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { text: longText }
    });
    
    expect(res.statusCode).toBe(400);
  });

  it('rejects PATCH /api/tasks/:id with empty text or invalid type', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];

    const emptyTextRes = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/fake-id',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { text: '   ' }
    });
    expect(emptyTextRes.statusCode).toBe(400);

    const invalidTypeRes = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/fake-id',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { type: 'magic_trick' }
    });
    expect(invalidTypeRes.statusCode).toBe(400);
  });

  it('preserves XSS string literally (escaped in UI, not DB)', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { text: 'Safe task', type: 'have_to' }
    });
    const task = JSON.parse(createRes.payload);

    const xssText = '<img src=x onerror=alert(1)>';
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie },
      payload: { text: xssText }
    });
    
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.payload);
    expect(updated.text).toBe(xssText); // API returns literal, UI escapes it
  });

  it('contract: client api methods send valid request shapes to server (R59)', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookie) ? cookie[0] : cookie;

    // Bridge fetch to app.inject
    const globalFetch = global.fetch;
    global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();
      const res = await app.inject({
        method: (options?.method || 'GET') as any,
        url: urlStr,
        headers: {
          ...(options?.headers as Record<string, string> || {}),
          cookie: cookieStr
        },
        payload: options?.body ? options.body : undefined
      });
      if (res.statusCode >= 400) {
        console.error('INJECT FAILED', urlStr, res.statusCode, res.payload, options?.body);
      }
      
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        json: async () => JSON.parse(res.payload)
      } as Response;
    };

    try {
      const { api } = await import('../client/src/api.js');
      
      // Test POST /api/tasks
      const addRes = await api.addTask('Contract Test', 'have_to');
      expect(addRes.id).toBeDefined();

      // Test PATCH /api/tasks/:id
      const patchRes = await api.updateTask(addRes.id, { text: 'Updated' });
      expect(patchRes.text).toBe('Updated');

      // Test DELETE /api/tasks/:id
      await api.deleteTask(addRes.id);

      // Test POST /api/rollover (This should FAIL against current HEAD)
      const rolloverRes = await api.triggerRollover();
      expect(rolloverRes.executed).toBeDefined();
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('pulling a backlog task properly moves it to today view', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];
    const authHeaders = { cookie: Array.isArray(cookie) ? cookie[0] : cookie as string };
    
    // Add a backlog task
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: authHeaders,
      payload: { text: 'Backlog Item', type: 'need_to', status: 'backlog' }
    });
    const task = JSON.parse(addRes.payload);

    // Pull to today (status=today)
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      headers: authHeaders,
      payload: { status: 'today' }
    });

    // Verify it appears in /api/today
    const todayRes = await app.inject({
      method: 'GET',
      url: '/api/today',
      headers: authHeaders,
    });
    const todayData = JSON.parse(todayRes.payload);
    expect(todayData.categories.need_to.find((t: any) => t.id === task.id)).toBeDefined();

    // Verify it does NOT appear in /api/backlog
    const backlogRes = await app.inject({
      method: 'GET',
      url: '/api/backlog',
      headers: authHeaders,
    });
    const backlogData = JSON.parse(backlogRes.payload);
    expect(backlogData.find((t: any) => t.id === task.id)).toBeUndefined();
  });

  it('GET /api/diagnostics returns 401 without session and 200 with session', async () => {
    // 401 without session
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/diagnostics',
    });
    expect(res1.statusCode).toBe(401);

    // 200 with session
    const loginRes = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'matrix_password' } });
    const cookie = loginRes.headers['set-cookie'];
    const authHeaders = { cookie: Array.isArray(cookie) ? cookie[0] : cookie as string };

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/diagnostics',
      headers: authHeaders,
    });
    expect(res2.statusCode).toBe(200);
    const data = JSON.parse(res2.payload);
    expect(Array.isArray(data.calendars)).toBe(true);
  });
});

