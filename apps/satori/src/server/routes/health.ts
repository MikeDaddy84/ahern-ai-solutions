import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { AppDatabase } from '../../db/client.js';
import { sql } from 'drizzle-orm';

let gitSha = 'unknown';
let buildTimestamp = new Date().toISOString();

try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: 'ignore' }).trim();
} catch (e) {
  gitSha = process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || 'unknown';
}

export function healthRoutes(db: AppDatabase) {
  return async function (fastify: FastifyInstance) {
    const getHealthPayload = () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        build: {
          gitSha,
          timestamp: buildTimestamp,
        },
      };
    };

    fastify.get('/health', { logLevel: 'silent' }, async (req, reply) => {
      return reply.send(getHealthPayload());
    });

    fastify.get('/health/ready', { logLevel: 'warn' }, async (req, reply) => {
      const payload: any = getHealthPayload();
      
      try {
        const timeoutMs = 2000;
        const queryPromise = db.run(sql.raw('SELECT 1'));
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        );
        
        await Promise.race([queryPromise, timeoutPromise]);
        payload.database = 'configured';
        return reply.send(payload);
      } catch (err) {
        req.log.warn({ err }, 'Health check failed: database unreachable');
        payload.database = 'unreachable';
        return reply.status(503).send(payload);
      }
    });
  };
}

