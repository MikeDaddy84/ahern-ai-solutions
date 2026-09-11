import { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../db/client.js';
import { getTodayTasks, getBacklogTasks, addTask, updateTask, deleteTask } from '../services/tasks.js';
import { desc } from 'drizzle-orm';
import { dayLog, logScope } from '../../db/schema.js';
import { CONFIG } from '../../shared/config.js';

export async function taskRoutes(fastify: FastifyInstance, options: { db: AppDatabase }) {
  const { db } = options;

  // GET /api/today
  fastify.get('/api/today', async (req, reply) => {
    const data = await getTodayTasks(db);
    return reply.send(data);
  });

  // GET /api/backlog
  fastify.get('/api/backlog', async (req, reply) => {
    const data = await getBacklogTasks(db);
    return reply.send(data);
  });

  // GET /api/history?limit=7&offset=0
  fastify.get('/api/history', async (req, reply) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const limitDays = parseInt(limit || '7', 10) || 7;
    const offsetDays = parseInt(offset || '0', 10) || 0;

    const logs = await db
      .select()
      .from(dayLog)
      .where(logScope())
      .orderBy(desc(dayLog.dayKey))
      .limit(limitDays)
      .offset(offsetDays);

    const result = logs.map((log) => ({
      dayKey: log.dayKey,
      createdAt: log.createdAt,
      summary: JSON.parse(log.summaryJson),
    }));

    return reply.send(result);
  });

  // POST /api/tasks
  fastify.post('/api/tasks', async (req, reply) => {
    const body = req.body as {
      text: string;
      type: 'have_to' | 'need_to' | 'want_to';
      target?: 'today' | 'backlog';
      source?: 'manual' | 'calendar';
    };

    if (!body.text || !body.type) {
      return reply.status(400).send({ error: 'Text and type are required' });
    }
    if (body.text.length > CONFIG.MAX_TASK_LENGTH) {
      return reply.status(400).send({ error: `Task text exceeds maximum length of ${CONFIG.MAX_TASK_LENGTH} characters` });
    }

    try {
      const task = await addTask(db, body);
      return reply.status(201).send(task);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /api/tasks/:id
  fastify.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      text?: string;
      type?: 'have_to' | 'need_to' | 'want_to';
      status?: 'backlog' | 'today' | 'done' | 'archived';
    };

    if (body.text && body.text.length > CONFIG.MAX_TASK_LENGTH) {
      return reply.status(400).send({ error: `Task text exceeds maximum length of ${CONFIG.MAX_TASK_LENGTH} characters` });
    }
    if (body.text !== undefined && body.text.trim().length === 0) {
      return reply.status(400).send({ error: 'Task text cannot be empty' });
    }
    if (body.type && !['have_to', 'need_to', 'want_to'].includes(body.type)) {
      return reply.status(400).send({ error: 'Invalid task type' });
    }
    if ((body.text !== undefined || body.type !== undefined) && (body.status !== undefined || 'dayKey' in body || 'day_key' in body)) {
      return reply.status(400).send({ error: 'Cannot modify status or day_key through an edit payload' });
    }

    try {
      const updated = await updateTask(db, id, body);
      return reply.send(updated);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /api/tasks/:id
  fastify.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const res = await deleteTask(db, id);
      return reply.send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/rollover
  fastify.post('/api/rollover', async (req, reply) => {
    const { runRollover } = await import('../services/rollover.js');
    try {
      const result = await runRollover(db, { force: true });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
