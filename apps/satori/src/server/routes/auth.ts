import { FastifyInstance } from 'fastify';
import { verifyPassword } from '../middleware/auth.js';
import { getAllCalendars } from '../services/calendar.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    const { password } = req.body as { password?: string };

    if (!password) {
      return reply.status(400).send({ error: 'Password required' });
    }

    const isValid = await verifyPassword(password);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    req.session.authenticated = true;
    return reply.send({ success: true, authenticated: true });
  });

  fastify.post('/api/logout', async (req, reply) => {
    req.session.authenticated = false;
    await req.session.destroy();
    return reply.send({ success: true, authenticated: false });
  });

  fastify.get('/api/me', async (req, reply) => {
    return reply.send({ authenticated: !!req.session.authenticated });
  });

  fastify.get('/api/diagnostics', async (req, reply) => {
    if (!req.session.authenticated) return reply.status(401).send({ error: 'Unauthorized' });
    const allCals = getAllCalendars();
    const calendars = allCals.map((cal) => {
      let host = undefined;
      try { host = new URL(cal.url).host; } catch (e) {}
      return { key: cal.key, configured: cal.configured, host };
    });
    return reply.send({ calendars });
  });

}

