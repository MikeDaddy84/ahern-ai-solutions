const crypto = require('node:crypto');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

const {accountList, readOnly, workspace} = require('./ono-mail-workspace');
const accountId = /^[a-z][a-z0-9_-]{0,31}$/;

function parseAccount(account, legacy) {
  if (!account || typeof account !== 'object') return null;
  const id = account.id ?? (legacy ? 'pilot' : '');
  const address = account.address ?? (legacy ? '' : null);
  if (typeof id !== 'string' || !accountId.test(id) || typeof address !== 'string' || address.length > 320 ||
      (!legacy && !address.includes('@')) || !Array.isArray(account.messages) || account.messages.length > 35) return null;
  const meta = {id,address,provider:['gmail','yahoo','imap'].includes(account.provider)?account.provider:'imap'};
  if (account.last_ok == null && account.unread === null && !account.messages.length) {
    return {...meta,lastSync:null,state:account.state==='error'?'error':'waiting',unread:null,messages:[]};
  }
  if (!Number.isFinite(Date.parse(account.last_ok)) || !['idle','syncing','error','degraded'].includes(account.state) ||
      !Number.isSafeInteger(account.unread) || account.unread < 0) return null;
  const messages = [];
  for (const m of account.messages) {
    if (!m || typeof m.subject !== 'string' || m.subject.length > 600 || typeof m.sender !== 'string' ||
        m.sender.length > 480 || !Number.isFinite(Date.parse(m.received)) || typeof m.important !== 'boolean' ||
        typeof m.unread !== 'boolean') return null;
    messages.push({subject:m.subject,sender:m.sender,received:new Date(m.received).toISOString(),important:m.important,unread:m.unread});
  }
  return {...meta,lastSync:new Date(account.last_ok).toISOString(),state:account.state,unread:account.unread,
    messages:messages.sort((a,b)=>b.received.localeCompare(a.received))};
}

function snapshot(body) {
  if (![1,2].includes(body?.version) || !Number.isFinite(Date.parse(body.updated)) ||
      !Array.isArray(body.accounts) || body.accounts.length > 16 ||
      (body.version===1 && body.accounts.length!==1)) return null;
  const accounts = body.accounts.map(a=>parseAccount(a,body.version===1));
  if (accounts.some(a=>!a) || new Set(accounts.map(a=>a.id)).size !== accounts.length) return null;
  return {updatedAt:new Date(body.updated).toISOString(),accounts};
}

function overview(data) {
  const accounts = data.accounts.map(({id,address,unread,lastSync,state})=>({
    id,address,unread,delayed:!lastSync || ['error','degraded'].includes(state) || Date.now()-Date.parse(lastSync)>600000
  }));
  const ready = accounts.filter(a=>a.unread!==null);
  const messages = data.accounts.flatMap(a=>a.messages.filter(m=>m.important).map(m=>({...m,account:a.address || a.id})))
    .sort((a,b)=>b.received.localeCompare(a.received)).slice(0,4);
  return {status:'ready',updatedAt:data.updatedAt,accounts,messages,
    unread:ready.length?ready.reduce((sum,a)=>sum+a.unread,0):null,delayed:accounts.some(a=>a.delayed)};
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
  if (!result.rows[0]?.snapshot) return null;
  const data = JSON.parse(result.rows[0].snapshot);
  if (Array.isArray(data.accounts)) return data;
  return {updatedAt:data.updatedAt,accounts:[{...data,id:'pilot',address:'',provider:'gmail'}]};
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
      res.json(overview(data));
    } catch { res.status(503).json({status:'unavailable',message:'Mail summary unavailable.'}); }
  });
  router.get('/portal/ono-sendai',owner,async(req,res) => {
    try {
      const data = await read(req);
      const accounts = data?.accounts || [];
      const content = accountList(accounts);
      res.send(shell({...req.portalUser,view:'ono-sendai',content}));
    } catch { res.sendStatus(503); }
  });
  router.get('/portal/ono-sendai/account/:id',owner,async(req,res) => {
    try {
      const account = (await read(req))?.accounts.find(a=>a.id===req.params.id);
      if (!account) return res.sendStatus(404);
      const paired = await require('./ono-mail-bridge').ownerBinding(req);
      res.send(shell({...req.portalUser,view:'ono-sendai',content:paired?workspace(account):readOnly(account)}));
    } catch {res.sendStatus(503);}
  });
  router.get('/portal/ono-sendai/setup',owner,(req,res) => res.send(shell({...req.portalUser,view:'ono-sendai',
    content:'<h1>Connect Ono-Sendai</h1>'+require('./ono-mail-workspace').setup+'<h2>Overview feed</h2><p>Create a feed key and enter it in the OnoSendaiBox setup terminal. Creating a key replaces the previous connection and clears its summary.</p><button type="button" class="portal-button" id="ono-pair">Create feed key</button><p role="status" id="ono-status"></p><output id="ono-key" style="overflow-wrap:anywhere"></output><script src="/ono-pair.js" defer></script>'})));
}
module.exports = { snapshot, installReceiver, install, read };
