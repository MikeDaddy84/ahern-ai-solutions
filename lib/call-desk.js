// Call Desk — cold-call script, call log and find-out queue for website prospects.
// Version 1.1.0 · built with Claude Opus 5.5 (claude-opus-5-5) · 2026-10-27
//
// Installed after the portal's session + CSRF middleware, so every route here
// already has req.portalUser and req.portalStore. Access is owner + employee:
// employees (sales) log calls and questions; only owners answer questions,
// confirm consults and change desk settings. Tables are additive calldesk_*
// tables in the portal database (see portal-schema.sql).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { escapeHtml: h } = require('./layout');

const PAGE = '/portal/call-desk';
const API = '/api/portal/call-desk';
const ROLES = new Set(['owner', 'employee']);
const OUTCOMES = ['booked', 'callback', 'sendinfo', 'voicemail', 'notinterested', 'nocontact', 'dnc'];
const SEEN = ['none', 'facebook', 'mobile', 'contact', 'broken', 'dated', 'other'];
const REACH = ['call', 'email', 'text'];
const ZONE = 'America/Chicago';

class InputError extends Error {}
function text(value, max, { required = false, name = 'field' } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new InputError('Invalid ' + name);
  const v = value.trim();
  if (required && !v) throw new InputError('Missing ' + name);
  if (v.length > max) throw new InputError(name + ' is too long');
  return v;
}
function pick(value, allowed, name) {
  if (!allowed.includes(value)) throw new InputError('Invalid ' + name);
  return value;
}
function requestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) throw new InputError('Invalid request key');
  return value;
}
const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const localSlot = (v) => (v === '' || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v));

// ---- Central Time due dates ----
function chicagoParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms));
  const o = {}; for (const p of parts) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, wd: o.weekday };
}
function chicagoWallToUtc(y, m, d, hour) {
  const guess = Date.UTC(y, m - 1, d, hour);
  const p = chicagoParts(guess);
  const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return guess - (asIfUtc - guess);
}
// Next business day, 5pm Central. A Friday question is due Monday.
function nextBusinessDay(now = Date.now()) {
  const p = chicagoParts(now);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d));
  do { day.setUTCDate(day.getUTCDate() + 1); } while ([0, 6].includes(day.getUTCDay()));
  return chicagoWallToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 17);
}

function page(user) {
  const html = fs.readFileSync(path.join(__dirname, '../public/call-desk/index.html'), 'utf8');
  return html.replace('<!-- PORTAL_SESSION -->',
    `<meta name="call-desk-csrf" content="${h(user.csrf)}"><meta name="call-desk-role" content="${h(user.role)}"><meta name="call-desk-name" content="${h(user.name)}">`);
}

const rowObj = (r) => Object.fromEntries(Object.entries(r));
async function state(client) {
  const [calls, questions, dnc, config] = await Promise.all([
    client.execute(`SELECT c.id,c.created_at,c.business,c.phone,c.phone_norm,c.website,c.seen,c.seen_other,c.contact,c.role,c.dm,c.email,c.best,c.outcome,c.consult_at,c.consult_label,c.confirmed,c.notes,COALESCE(u.name,'') AS by_name
      FROM calldesk_calls c LEFT JOIN portal_users u ON u.id=c.by_user ORDER BY c.created_at DESC LIMIT 500`),
    client.execute(`SELECT q.id,q.call_id,q.asked_at,q.due_by,q.text,q.reach,q.reach_to,q.business,q.contact,q.phone,q.email,q.status,q.answer,q.answered_at,q.relayed_at,COALESCE(u.name,'') AS by_name
      FROM calldesk_questions q LEFT JOIN portal_users u ON u.id=q.by_user ORDER BY q.asked_at DESC LIMIT 500`),
    // Do-not-call never ages out of the check, unlike the 500-row log window.
    client.execute(`SELECT business,phone_norm,MAX(created_at) AS created_at FROM calldesk_calls WHERE outcome='dnc' GROUP BY business,phone_norm`),
    client.execute('SELECT key,value FROM calldesk_config'),
  ]);
  const cfg = { availability: '', length: 20, callback_phone: '' };
  for (const r of config.rows) {
    if (r.key === 'availability' || r.key === 'callback_phone') cfg[r.key] = String(r.value);
    if (r.key === 'length') cfg.length = Number(r.value) || 20;
  }
  return {
    calls: calls.rows.map(r => ({ ...rowObj(r), created_at: Number(r.created_at), confirmed: !!Number(r.confirmed) })),
    questions: questions.rows.map(r => ({ ...rowObj(r), asked_at: Number(r.asked_at), due_by: Number(r.due_by), answered_at: r.answered_at == null ? null : Number(r.answered_at), relayed_at: r.relayed_at == null ? null : Number(r.relayed_at) })),
    dnc: dnc.rows.map(r => ({ business: String(r.business || ''), phone_norm: String(r.phone_norm || ''), created_at: Number(r.created_at) })),
    config: cfg,
    next_due: nextBusinessDay(),
  };
}

function validateCall(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid call');
  const c = {
    request_key: requestKey(body.request_key),
    business: text(body.business, 160, { name: 'business' }),
    phone: text(body.phone, 40, { name: 'phone' }),
    website: text(body.website, 300, { name: 'website' }),
    seen: pick(body.seen || 'none', SEEN, 'seen'),
    seen_other: text(body.seen_other, 200, { name: 'seen_other' }),
    contact: text(body.contact, 120, { name: 'contact' }),
    role: text(body.role, 120, { name: 'role' }),
    dm: text(body.dm, 120, { name: 'dm' }),
    email: text(body.email, 254, { name: 'email' }),
    best: text(body.best, 200, { name: 'best' }),
    outcome: pick(body.outcome, OUTCOMES, 'outcome'),
    consult_at: text(body.consult_at, 16, { name: 'consult_at' }),
    consult_label: text(body.consult_label, 80, { name: 'consult_label' }),
    notes: text(body.notes, 4000, { name: 'notes' }),
  };
  if (!localSlot(c.consult_at)) throw new InputError('Invalid consult_at');
  if (!c.business && !c.phone) throw new InputError('Add the business name or phone number');
  if (c.outcome === 'booked' && (!c.consult_at || !c.email)) throw new InputError('Booked calls need a consult time and an email');
  const ids = body.question_ids === undefined ? [] : body.question_ids;
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))) throw new InputError('Invalid question_ids');
  c.question_ids = ids;
  return c;
}
function validateQuestion(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid question');
  return {
    request_key: requestKey(body.request_key),
    text: text(body.text, 1000, { required: true, name: 'question' }),
    reach: pick(body.reach || 'call', REACH, 'reach'),
    reach_to: text(body.reach_to, 254, { name: 'reach_to' }),
    business: text(body.business, 160, { name: 'business' }),
    contact: text(body.contact, 120, { name: 'contact' }),
    phone: text(body.phone, 40, { name: 'phone' }),
    email: text(body.email, 254, { name: 'email' }),
  };
}

async function addCall(client, user, body) {
  const c = validateCall(body);
  const id = crypto.randomUUID();
  const tx = await client.transaction('write');
  try {
    const existing = await tx.execute({ sql: 'SELECT id FROM calldesk_calls WHERE request_key=?', args: [c.request_key] });
    if (existing.rows.length) { await tx.commit(); return { id: String(existing.rows[0].id), replay: true }; }
    await tx.execute({
      sql: `INSERT INTO calldesk_calls(id,request_key,created_at,by_user,business,phone,phone_norm,website,seen,seen_other,contact,role,dm,email,best,outcome,consult_at,consult_label,confirmed,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      args: [id, c.request_key, Date.now(), user.id, c.business, c.phone, normPhone(c.phone), c.website, c.seen, c.seen_other, c.contact, c.role, c.dm, c.email, c.best, c.outcome, c.consult_at, c.consult_label, c.notes],
    });
    for (const qid of c.question_ids) await tx.execute({ sql: 'UPDATE calldesk_questions SET call_id=? WHERE id=? AND call_id IS NULL', args: [id, qid] });
    await tx.commit();
    return { id, replay: false };
  } catch (e) { await tx.rollback(); throw e; } finally { tx.close(); }
}
async function addQuestion(client, user, body) {
  const q = validateQuestion(body);
  const existing = await client.execute({ sql: 'SELECT id,due_by FROM calldesk_questions WHERE request_key=?', args: [q.request_key] });
  if (existing.rows.length) return { id: String(existing.rows[0].id), due_by: Number(existing.rows[0].due_by) };
  const id = crypto.randomUUID(), due = nextBusinessDay();
  await client.execute({
    sql: `INSERT INTO calldesk_questions(id,request_key,asked_at,due_by,by_user,text,reach,reach_to,business,contact,phone,email,status,answer)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'open','')`,
    args: [id, q.request_key, Date.now(), due, user.id, q.text, q.reach, q.reach_to, q.business, q.contact, q.phone, q.email],
  });
  return { id, due_by: due };
}

function install(router) {
  router.use([PAGE, API], (req, res, next) => {
    if (!ROLES.has(req.portalUser.role)) return res.status(403).type('text').send('The Call Desk is for the Ahern AI team.');
    next();
  });
  const ownerOnly = (req, res, next) => req.portalUser.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner can do that.' });
  const fail = (res, error, what) => {
    if (error instanceof InputError) return res.status(400).json({ error: error.message });
    console.error('[call-desk] ' + what + ' failed');
    res.status(503).json({ error: 'The call desk could not save that. Your entry is still on screen — retry.' });
  };

  router.get(PAGE, (req, res) => res.send(page(req.portalUser)));
  router.get(API + '/state', async (req, res) => {
    try { res.json({ me: { name: req.portalUser.name, role: req.portalUser.role }, ...(await state(req.portalStore.client)) }); }
    catch (e) { fail(res, e, 'state'); }
  });
  router.post(API + '/calls', async (req, res) => {
    try { res.status(201).json(await addCall(req.portalStore.client, req.portalUser, req.body)); }
    catch (e) { fail(res, e, 'call'); }
  });
  router.post(API + '/questions', async (req, res) => {
    try { res.status(201).json(await addQuestion(req.portalStore.client, req.portalUser, req.body)); }
    catch (e) { fail(res, e, 'question'); }
  });
  router.post(API + '/questions/:id/answer', ownerOnly, async (req, res) => {
    try {
      const answer = text(req.body?.answer, 4000, { required: true, name: 'answer' });
      const r = await req.portalStore.client.execute({ sql: "UPDATE calldesk_questions SET status='answered',answer=?,answered_at=?,answered_by=? WHERE id=? AND status!='relayed'", args: [answer, Date.now(), req.portalUser.id, req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Question not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'answer'); }
  });
  router.post(API + '/questions/:id/relay', async (req, res) => {
    try {
      const r = await req.portalStore.client.execute({ sql: "UPDATE calldesk_questions SET status='relayed',relayed_at=? WHERE id=? AND status='answered'", args: [Date.now(), req.params.id] });
      if (!r.rowsAffected) return res.status(409).json({ error: 'Only answered questions can be marked relayed.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'relay'); }
  });
  router.post(API + '/calls/:id/confirm', ownerOnly, async (req, res) => {
    try {
      const r = await req.portalStore.client.execute({ sql: "UPDATE calldesk_calls SET confirmed=1,confirmed_at=? WHERE id=? AND outcome='booked'", args: [Date.now(), req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Booked call not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'confirm'); }
  });
  router.put(API + '/config', ownerOnly, async (req, res) => {
    try {
      const availability = text(req.body?.availability, 1000, { name: 'availability' });
      const callback = text(req.body?.callback_phone, 40, { name: 'callback_phone' });
      const length = Number(req.body?.length);
      if (!Number.isInteger(length) || length < 10 || length > 90) throw new InputError('Consult length must be 10–90 minutes');
      const now = Date.now(), by = req.portalUser.id;
      const upsert = 'INSERT INTO calldesk_config(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by';
      await req.portalStore.client.batch([
        { sql: upsert, args: ['availability', availability, now, by] },
        { sql: upsert, args: ['length', String(length), now, by] },
        { sql: upsert, args: ['callback_phone', callback, now, by] },
      ], 'write');
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'config'); }
  });
  router.all(API + '/*', (req, res) => res.status(404).json({ error: 'Not found.' }));
}

module.exports = { install, page, state, validateCall, validateQuestion, nextBusinessDay, normPhone, PAGE, API };
