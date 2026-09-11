import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';

declare module 'fastify' {
  interface FastifySessionObject {
    authenticated?: boolean;
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.PORTAL_PASSWORD_HASH;
  if (!hash) {
    console.error('PORTAL_PASSWORD_HASH environment variable is not set!');
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch (err) {
    console.error('Password comparison failed:', err);
    return false;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authenticated) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

