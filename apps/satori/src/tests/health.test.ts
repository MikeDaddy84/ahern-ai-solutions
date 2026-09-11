import { describe, it, expect, vi, beforeEach } from 'vitest';
import fastify from 'fastify';
import { healthRoutes } from '../server/routes/health.js';
import { AppDatabase } from '../db/client.js';

describe('Health Routes', () => {
  let app: any;

  beforeEach(() => {
    app = fastify();
  });

  it('/health returns 200 without querying the database', async () => {
    const mockDb = {
      run: vi.fn().mockRejectedValue(new Error('Should not be called')),
    } as unknown as AppDatabase;

    app.register(healthRoutes(mockDb));

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(mockDb.run).not.toHaveBeenCalled();
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.database).toBeUndefined();
    expect(payload.build).toBeDefined();
  });

  it('/health/ready returns 200 and configured when database is reachable', async () => {
    const mockDb = {
      run: vi.fn().mockResolvedValue({}),
    } as unknown as AppDatabase;

    app.register(healthRoutes(mockDb));

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(mockDb.run).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.database).toBe('configured');
  });

  it('/health/ready returns 503 and unreachable when database errors out', async () => {
    const mockDb = {
      run: vi.fn().mockRejectedValue(new Error('DB Connection Refused')),
    } as unknown as AppDatabase;

    app.register(healthRoutes(mockDb));

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(mockDb.run).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.database).toBe('unreachable');
  });

  it('/health/ready returns 503 and unreachable when database times out', async () => {
    const mockDb = {
      run: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 3000))),
    } as unknown as AppDatabase;

    app.register(healthRoutes(mockDb));

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.database).toBe('unreachable');
  });
});

