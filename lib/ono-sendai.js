const crypto = require('node:crypto');
const { escapeHtml: h } = require('./layout');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

function snapshot(body) {
  const account = body?.accounts?.[0];
  if (body?.version !== 1 || !Array.isArray(body.accounts) || body.accounts.length !== 1 || !account || !Number.isFinite(Date.parse(body.updated)) ||
      !Number.isFinite(Date.parse(account.last_ok)) || !['idle','syncing','error','degraded'].includes(account.state) ||
      !Number.isSafeInteger(account.unread) || account.unread < 0 || !Array.isArray(account.messages) || account.messages.length > 35) return null;
  const messages = [];
  for (const m of account.messages) {
    if (!m || typeof m.subject !== 'string' || m.subject.length > 600 || typeof m.sender !== 'string' ||
        m.sender.length > 480 || !Number.isFinite(Date.parse(m.received)) || typeof m.important !== 'boolean' ||
        typeof m.unread !== 'boolean') return null;
    messages.push({ subject:m.subject, sender:m.sender, received:new Date(m.received).toISOString(), important:m.important, unread:m.unread });
  }
  return { updatedAt:new Date(body.updated).toISOString(), lastSync:new Date(account.last_ok).toISOString(),
    state:account.state, unread:account.unread, messages:messages.sort((a,b)=>b.received.localeCompare(a.received)) };
}

function installReceiver(router, storeProvider) {
  const { rateLimit } = require('./contact');
  router.post('/api/portal/ono-sendai-feed', rateLimit({limit:60}), async (req,res) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '');
    if (!match) return res.sendStatus(401);
    const data = snapshot(req.body);
    if (!data || Date.parse(data.updatedAt) > Date.now() + 60000) return res.sendStatus(400);
    try {
      const store = storeProvider();
      await store.prepare();
      const digest = hash(match[1]);
      const sql = `UPDATE portal_mail_feeds SET snapshot=?, updated=?
        WHERE token_hash=? AND user_id IN (SELECT id FROM portal_users WHERE role='owner' AND disabled=0)
        AND updated<=? RETURNING user_id`;
      const ts = Date.parse(data.updatedAt);
      const result = await store.client.execute({sql,args:[JSON.stringify(data),ts,digest,ts]});
      return res.sendStatus(result.rows.length ? 204 : 403);
    } catch { return res.sendStatus(503); }
  });
}

async function read(req) {
  const result = await req.portalStore.client.execute({sql:'SELECT snapshot FROM portal_mail_feeds WHERE user_id=?',args:[req.portalUser.id]});
  return result.rows[0]?.snapshot ? JSON.parse(result.rows[0].snapshot) : null;
}

function install(router, shell, mailbox) {
  const owner = (req,res,next) => req.portalUser?.role === 'owner' ? next() : res.sendStatus(403);
  mailbox.ownerRoutes(router, owner);
  router.post('/api/portal/ono-sendai/pair', owner, async (req,res) => {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      await req.portalStore.client.execute({sql:`INSERT INTO portal_mail_feeds (user_id,token_hash) VALUES(?,?)
        ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, snapshot=NULL, updated=0`,args:[req.portalUser.id,hash(token)]});
      res.json({token});
    } catch { res.sendStatus(503); }
  });
  router.get('/api/portal/overview/ono-sendai', owner, async(req,res) => {
    try {
      const data = await read(req);
      if (!data) return res.status(503).json({status:'unavailable',message:'Waiting for the first mailbox sync.'});
      res.json({status:'ready',updatedAt:data.lastSync,unread:data.unread,
        delayed:['error','degraded'].includes(data.state) || Date.now()-Date.parse(data.lastSync)>600000,
        messages:data.messages.filter(m=>m.important).slice(0,4)});
    } catch { res.status(503).json({status:'unavailable',message:'Mail summary unavailable.'}); }
  });
  router.get('/portal/ono-sendai',owner,async(req,res) => {
    try {
      const data = await read(req);
      if (await require('./ono-mail-bridge').ownerBinding(req)) {
        return res.send(shell({...req.portalUser,view:'ono-sendai',content:require('./ono-mail-workspace').workspace()}));
      }
      const messages = data?.messages.map(m => '<li><strong>' + (m.important?'★ ':'') + h(m.subject || '(No subject)') +
        '</strong><p>' + h(m.sender || '(Unknown sender)') + '</p><small>' + h(m.received) + (m.unread?' · Unread':'') + '</small></li>').join('');
      const content = '<h1>Ono-Sendai</h1><section class="overview-card"><h2>Recent inbox mail</h2>' +
        (data ? '<p>'+data.unread+' unread · Last synced '+h(data.lastSync)+'</p>' +
        ((Date.now()-Date.parse(data.lastSync)>600000 || ['error','degraded'].includes(data.state))?'<p>Mail updates are delayed.</p>':'') +
        (messages?'<ul class="overview-list">'+messages+'</ul>':'<p>Your mirrored inbox is empty.</p>') :
        '<p>Waiting for the first mailbox sync.</p>') +
        '</section><p><a href="/portal/ono-sendai/setup">Manage mailbox connection</a></p>';
      res.send(shell({...req.portalUser,view:'ono-sendai',content}));
    } catch { res.sendStatus(503); }
  });
  router.get('/portal/ono-sendai/setup',owner,(req,res) => res.send(shell({...req.portalUser,view:'ono-sendai',
    content:'<h1>Connect Ono-Sendai</h1>'+require('./ono-mail-workspace').setup+'<h2>Overview feed</h2><p>Create a feed key and enter it in the OnoSendaiBox setup terminal. Creating a key replaces the previous connection and clears its summary.</p><button type="button" class="portal-button" id="ono-pair">Create feed key</button><p role="status" id="ono-status"></p><output id="ono-key" style="overflow-wrap:anywhere"></output><script src="/ono-pair.js" defer></script>'})));
}
module.exports = { snapshot, installReceiver, install, read };
