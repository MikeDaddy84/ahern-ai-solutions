// Runs inside the website process, without an HTTP listener. One worker and
// per-workspace module state keep calendar/rollover caches isolated. Database
// tables are shared; every service query is constrained to the server-owned key.
import { parentPort, workerData } from 'node:worker_threads';
import fastify from 'fastify';
import { createDb, initTables } from './dist/db/client.js';
import { taskRoutes } from './dist/server/routes/tasks.js';
import { calendarRoutes } from './dist/server/routes/calendar.js';
import { runRollover } from './dist/server/services/rollover.js';
if (!workerData.workspaceKey || workerData.workspaceKey !== process.env.SATORI_WORKSPACE_KEY) throw new Error('Workspace context required');
const db = createDb(workerData.url, workerData.authToken);
await initTables(db);
const app = fastify({logger:false});
app.addHook('preHandler', async (req, reply) => {
  const body = req.body;
  if (req.method === 'POST' && req.url === '/api/tasks') {
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length>200 || !['have_to','need_to','want_to'].includes(body.type) || (body.target!==undefined && !['today','backlog'].includes(body.target)) || (body.source!==undefined && !['manual','calendar'].includes(body.source))) return reply.status(400).send({error:'Invalid task.'});
  }
  if (req.method === 'PATCH') {
    if (!body || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(k=>!['text','type','status'].includes(k)) || (body.text!==undefined && typeof body.text!=='string') || (body.status!==undefined && !['today','backlog','done','archived'].includes(body.status))) return reply.status(400).send({error:'Invalid task update.'});
  }
  if (req.url.startsWith('/api/history')) {
    const {limit='7',offset='0'}=req.query;
    if (!/^\d+$/.test(limit) || !/^\d+$/.test(offset) || Number(limit)<1 || Number(limit)>90 || Number(offset)>10000) return reply.status(400).send({error:'Invalid history range.'});
  }
  await runRollover(db);
});
app.register(taskRoutes,{db});
app.register(calendarRoutes);
await app.ready();
parentPort.postMessage({ready:true});
let queue = Promise.resolve();
parentPort.on('message', message => {
  // Serialize requests within a workspace so rollover and writes cannot race.
  queue = queue.then(async () => {
    try {
      const response=await app.inject({method:message.method,url:message.url,...(message.body!==undefined ? {payload:message.body} : {})});
      parentPort.postMessage({id:message.id,status:response.statusCode,body:response.statusCode>=500 ? JSON.stringify({error:'Satori is temporarily unavailable. Please retry.'}) : response.body});
    } catch { parentPort.postMessage({id:message.id,status:503,body:JSON.stringify({error:'Satori is temporarily unavailable. Please retry.'})}); }
  });
});
