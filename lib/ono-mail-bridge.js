const { createHash, randomUUID } = require('node:crypto');

const actions = new Set(['folders', 'list', 'read', 'create', 'move', 'seen', 'send']);
const digest = value => createHash('sha256').update(value).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const bindingSql = `SELECT d.user_id,d.device_hash,f.token_hash FROM portal_mail_devices d
  JOIN portal_mail_feeds f ON f.user_id=d.user_id AND f.token_hash=d.feed_hash
  JOIN portal_users u ON u.id=d.user_id AND u.disabled=0 AND u.role='owner'`;
const bindingId = row => [row.user_id, row.token_hash, row.device_hash].join(':');

async function ownerBinding(req) {
  const {rows} = await req.portalStore.client.execute({
    sql: bindingSql + ' WHERE d.user_id=?', args: [req.portalUser.id]
  });
  return rows[0];
}

// Each request is delivered to at most one poll. Losing the connection never resubmits a send.
function makeBridge() {
  const polls = new Map(), jobs = new Map();
  function dispatch(key) {
    const poll = polls.get(key);
    if (!poll) return;
    const job = [...jobs.values()].find(j => j.key === key && !j.delivered);
    if (!job) return;
    polls.delete(key);
    job.delivered = true;
    poll.json({id:job.id, command:job.command});
  }
  function deviceRoutes(router, storeProvider) {
    router.use('/api/portal/ono-device', async (req,res,next) => {
      res.set('Cache-Control','no-store');
      const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '');
      const device = req.get('X-Ono-Device') || '';
      if (!bearer || !hex.test(device)) return res.sendStatus(401);
      try {
        const store = storeProvider();
        await store.prepare();
        const {rows} = await store.client.execute({sql:bindingSql+' WHERE f.token_hash=? AND d.device_hash=?',
          args:[digest(bearer[1]),digest(device)]});
        if (!rows.length) return res.sendStatus(403);
        req.mailBinding = bindingId(rows[0]);
        next();
      } catch { res.sendStatus(503); }
    });
    router.post('/api/portal/ono-device/poll',(req,res) => {
      const key = req.mailBinding;
      if (polls.has(key)) polls.get(key).status(204).end();
      polls.set(key,res);
      const timer = setTimeout(() => res.status(204).end(),20000);
      res.once('close',() => { clearTimeout(timer); if (polls.get(key)===res) polls.delete(key); });
      dispatch(key);
    });
    router.post('/api/portal/ono-device/result',(req,res) => {
      const job = jobs.get(req.body?.id);
      if (!job?.delivered || job.key!==req.mailBinding) return res.sendStatus(404);
      jobs.delete(job.id);
      if (typeof req.body.error === 'string') job.res.status(422).json({error:req.body.error.slice(0,300)});
      else job.res.json(req.body.value ?? {});
      res.sendStatus(204);
    });
  }
  function ownerRoutes(router, owner) {
    router.post('/api/portal/ono-sendai/device',owner,async(req,res) => {
      const fingerprint = req.body?.fingerprint;
      if (typeof fingerprint !== 'string' || !hex.test(fingerprint)) return res.status(400).json({error:'Enter the full device fingerprint.'});
      try {
        const result = await req.portalStore.client.execute({sql:`INSERT INTO portal_mail_devices(user_id,device_hash,feed_hash)
          SELECT user_id,?,token_hash FROM portal_mail_feeds WHERE user_id=? AND snapshot IS NOT NULL
          ON CONFLICT(user_id) DO UPDATE SET device_hash=excluded.device_hash, feed_hash=excluded.feed_hash`,
          args:[fingerprint,req.portalUser.id]});
        if (!result.rowsAffected) return res.status(409).json({error:'Complete the first mailbox sync before enabling the client.'});
        res.sendStatus(204);
      } catch {res.status(503).json({error:'Mailbox setup is unavailable.'});}
    });
    router.post('/api/portal/ono-sendai/mail',owner,async(req,res) => {
      if (!actions.has(req.body?.action)) return res.status(400).json({error:'Unknown mailbox action.'});
      try {
        const row = await ownerBinding(req);
        if (!row) return res.status(403).json({error:'Enable the mail client in mailbox setup.'});
        const key = bindingId(row);
        if ([...jobs.values()].filter(j=>j.key===key).length>=8) return res.status(429).json({error:'The mailbox is busy. Try again shortly.'});
        const id = randomUUID(), job = {id,key,res,command:req.body,delivered:false};
        jobs.set(id,job);
        const offline = setTimeout(() => {
          if (!job.delivered) res.status(503).json({error:'Ono-Sendai is offline or busy. Try again shortly.'});
        },9000);
        const timeout = setTimeout(() => res.status(504).json({error:'The mailbox did not confirm this operation. Check the folder or Sent before retrying.'}),55000);
        res.once('close',() => {clearTimeout(offline);clearTimeout(timeout);jobs.delete(id);});
        dispatch(key);
      } catch {res.status(503).json({error:'Mailbox connection unavailable.'});}
    });
  }
  return {deviceRoutes,ownerRoutes};
}
module.exports = {makeBridge,ownerBinding};
