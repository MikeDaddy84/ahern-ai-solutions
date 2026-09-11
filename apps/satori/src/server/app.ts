import fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppDatabase } from '../db/client.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { taskRoutes } from './routes/tasks.js';
import { calendarRoutes } from './routes/calendar.js';
import { runRollover } from './services/rollover.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSessionConfig = () => ({
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

export function buildApp(db: AppDatabase): FastifyInstance {
  const app = fastify({
    logger: {
      level: 'info',
      serializers: {
        req(request: any) {
          return {
            method: request.method,
            url: request.url,
          };
        },
        res(reply: any) {
          return {
            statusCode: reply.statusCode,
          };
        },
        err(error: any) {
          return {
            type: error.name,
            message: error.message,
            stack: error.stack || '',
          };
        }
      }
    },
    // Validate the proxy address; hop-count-only trust permits spoofed headers.
    trustProxy: ['loopback', 'linklocal', 'uniquelocal']
  });

  // Register cookie and session
  app.register(fastifyCookie);
  app.register(fastifySession, {
    secret: process.env.SESSION_SECRET || 'a_very_long_secret_key_that_is_at_least_32_chars_long!',
    saveUninitialized: false,
    cookie: getSessionConfig(),
  });

  app.register(fastifyRateLimit, {
    max: 100, // global max 100 per minute
    timeWindow: '1 minute'
  });

  // Health routes (unauthenticated)
  app.register(healthRoutes(db));

  // Auth routes (/api/login, /api/logout, /api/me)
  app.register(authRoutes);

  // Auth + Lazy Rollover Hook for all other /api routes
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url;

    // Skip auth for non-API, health, login, logout, me
    if (!url.startsWith('/api') || url.startsWith('/api/login') || url.startsWith('/api/logout') || url.startsWith('/api/me')) {
      return;
    }

    // Require auth
    if (!req.session.authenticated) {
      reply.status(401).send({ error: 'Unauthorized' });
      return reply;
    }

    // Lazy Rollover execution on authenticated requests
    try {
      await runRollover(db);
    } catch (err) {
      console.error('Lazy rollover error (non-blocking):', err);
    }
  });

  app.register(taskRoutes, { db });
  app.register(calendarRoutes);

  // Serve static SPA files from dist/public
  const publicDir = path.resolve(__dirname, '../../dist/public');
  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // SPA fallback handler
  app.setNotFoundHandler((req, reply) => {
    // CRITICAL: Do NOT capture /health or /api routes in SPA fallback
    if (req.url.startsWith('/health') || req.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
