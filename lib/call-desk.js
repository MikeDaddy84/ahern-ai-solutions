// Call Desk — cold-call script, call log and find-out queue for website prospects.
// Version 1.3.0 · built with Claude Fable 5.2 (claude-fable-5-2) · 2026-11-10
// 1.3.0: email alert to the owner on a booked consult or a new find-out, and a
//        dated follow-up queue (calldesk_followups).
// 1.2.1: do-not-call list in its own table (only an owner lifts a flag), all-history
//        "called before" lookup and log search, double-booking guard, error detail
//        in logs, single-source version string.
// 1.2.0: owner-only edit/delete for logged calls and delete for find-out questions
//        (Claude Opus 5.5, 2026-10-27).
//
// Installed after the portal's session + CSRF middleware, so every route here
// already has req.portalUser and req.portalStore. Access is owner + employee:
// employees (sales) log calls and questions; only owners answer questions,
// confirm consults, lift do-not-call flags and change desk settings. Tables are
// additive calldesk_* tables in the portal database (see portal-schema.sql).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { escapeHtml: h } = require('./layout');

const VERSION = '1.3.0';
const PAGE = '/portal/call-desk';
const API = '/api/portal/call-desk';
const ROLES = new Set(['owner', 'employee']);
const OUTCOMES = ['booked', 'callback', 'sendinfo', 'voicemail', 'notinterested', 'nocontact', 'dnc'];
const SEEN = ['none', 'facebook', 'mobile', 'contact', 'broken', 'dated', 'other'];
const REACH = ['call', 'email', 'text'];
const ZONE = 'America/Chicago';
const DNC_HIT_NOTE = '[DNC HIT] Logged against a number on the do-not-call list.';
// Outcomes that can carry a follow-up date. "Call back" always gets one.
const FOLLOWABLE = new Set(['callback', 'sendinfo', 'voicemail', 'nocontact']);
const DESK_URL = 'https://ahernai.com/portal/call-desk';

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
// "Strawn Diner, LLC" and "the strawn diner" are the same business. Keep this in
// step with normBiz in public/call-desk/app.js.
const BIZ_SUFFIX = new Set(['llc', 'inc', 'co', 'company', 'corp', 'corporation', 'ltd', 'lp', 'llp', 'pllc', 'pc']);
function normBiz(name) {
  const words = String(name || '').toLowerCase().replace(/\./g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (words[0] === 'the') words.shift();
  while (words.length > 1 && BIZ_SUFFIX.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}
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

const chicagoDate = (ms) => { const p = chicagoParts(ms); return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); };
const nextBusinessDate = (now = Date.now()) => chicagoDate(nextBusinessDay(now));
function followDate(value) {
  const v = text(value, 10, { name: 'follow_up' });
  if (v === '') return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00Z') : new Date(NaN);
  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) throw new InputError('Invalid follow-up date');
  return v;
}

// ---- owner alerts ----
// Best effort and never in the way of a save: sent after the write commits,
// retried once, and the desk itself stays the record if mail is down.
let mailer; // undefined = not looked up yet, null = mail not configured
const getMailer = () => (mailer === undefined ? (mailer = require('./notifications').createMailer()) : mailer);
const setMailer = (fn) => { mailer = fn; };
function alertOwner(message) {
  const send = getMailer();
  if (!send) return;
  const failed = (e) => console.error('[call-desk] alert email failed: ' + String(e && e.message || e).slice(0, 200));
  Promise.resolve().then(() => send(message)).catch(() => { setTimeout(() => Promise.resolve().then(() => send(message)).catch(failed), 30000).unref(); });
}
const looksLikeEmail = (v) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v);
const lines = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join('\n');
function bookedAlert(id, c, user) {
  return {
    key: 'ahern-calldesk-booked-' + id,
    subject: 'Call Desk: consult booked, ' + (c.business || c.contact || 'new prospect') + (c.consult_label ? ' (' + c.consult_label + ')' : ''),
    replyTo: looksLikeEmail(c.email) ? c.email : undefined,
    text: [(user.name || 'Someone') + ' booked a free consult. It needs your confirmation email.', '',
      lines([['When', c.consult_label || c.consult_at], ['Business', c.business], ['Contact', c.contact], ['Role', c.role], ['Decision maker', c.dm],
        ['Email', c.email], ['Phone', c.phone], ['Their website', c.website], ['Notes', c.notes]]), '',
      looksLikeEmail(c.email) ? 'Replying to this email goes to the prospect.' : 'No usable email was recorded, so call them to confirm.',
      'Then mark it confirmed: ' + DESK_URL + '#log'].join('\n'),
  };
}
function questionAlert(id, q, user, due) {
  const dueText = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(due));
  return {
    key: 'ahern-calldesk-question-' + id,
    subject: 'Call Desk: find-out from ' + (q.business || q.contact || 'a prospect') + ', due ' + dueText,
    text: [(user.name || 'Someone') + ' promised an answer by 5pm Central on ' + dueText + '.', '', 'Question: ' + q.text, '',
      lines([['Business', q.business], ['Contact', q.contact], ['Answer by', q.reach + (q.reach_to ? ' to ' + q.reach_to : '')], ['Phone', q.phone], ['Email', q.email]]), '',
      'Answer it here: ' + DESK_URL + '#questions'].join('\n'),
  };
}

function page(user) {
  const html = fs.readFileSync(path.join(__dirname, '../public/call-desk/index.html'), 'utf8');
  return html.replaceAll('{{DESK_VERSION}}', VERSION).replace('<!-- PORTAL_SESSION -->',
    `<meta name="call-desk-csrf" content="${h(user.csrf)}"><meta name="call-desk-role" content="${h(user.role)}"><meta name="call-desk-name" content="${h(user.name)}">`);
}

const CALL_SELECT = `SELECT c.id,c.created_at,c.business,c.phone,c.phone_norm,c.website,c.seen,c.seen_other,c.contact,c.role,c.dm,c.email,c.best,c.outcome,c.consult_at,c.consult_label,c.confirmed,c.notes,COALESCE(u.name,'') AS by_name,
      COALESCE((SELECT f.due_on FROM calldesk_followups f WHERE f.call_id=c.id AND f.done_at IS NULL),'') AS follow_up
      FROM calldesk_calls c LEFT JOIN portal_users u ON u.id=c.by_user`;
const rowObj = (r) => Object.fromEntries(Object.entries(r));
const callRow = (r) => ({ ...rowObj(r), created_at: Number(r.created_at), confirmed: !!Number(r.confirmed), follow_up: String(r.follow_up || '') });
async function state(client) {
  const [calls, questions, dnc, config, followups] = await Promise.all([
    client.execute(CALL_SELECT + ' ORDER BY c.created_at DESC LIMIT 500'),
    client.execute(`SELECT q.id,q.call_id,q.asked_at,q.due_by,q.text,q.reach,q.reach_to,q.business,q.contact,q.phone,q.email,q.status,q.answer,q.answered_at,q.relayed_at,COALESCE(u.name,'') AS by_name
      FROM calldesk_questions q LEFT JOIN portal_users u ON u.id=q.by_user ORDER BY q.asked_at DESC LIMIT 500`),
    // Do-not-call never ages out of the check, unlike the 500-row log window.
    client.execute('SELECT id,business,phone_norm,created_at FROM calldesk_dnc WHERE removed_at IS NULL ORDER BY created_at DESC'),
    client.execute('SELECT key,value FROM calldesk_config'),
    // Open follow-ups come from the whole log, oldest due date first.
    client.execute(CALL_SELECT + ' JOIN calldesk_followups fq ON fq.call_id=c.id WHERE fq.done_at IS NULL ORDER BY fq.due_on,c.created_at LIMIT 300'),
  ]);
  const cfg = { availability: '', length: 20, callback_phone: '' };
  for (const r of config.rows) {
    if (r.key === 'availability' || r.key === 'callback_phone') cfg[r.key] = String(r.value);
    if (r.key === 'length') cfg.length = Number(r.value) || 20;
  }
  return {
    calls: calls.rows.map(callRow),
    questions: questions.rows.map(r => ({ ...rowObj(r), asked_at: Number(r.asked_at), due_by: Number(r.due_by), answered_at: r.answered_at == null ? null : Number(r.answered_at), relayed_at: r.relayed_at == null ? null : Number(r.relayed_at) })),
    dnc: dnc.rows.map(r => ({ id: String(r.id), business: String(r.business || ''), phone_norm: String(r.phone_norm || ''), created_at: Number(r.created_at) })),
    followups: followups.rows.map(callRow),
    config: cfg,
    next_due: nextBusinessDay(),
    today: chicagoDate(Date.now()),
    next_business_date: nextBusinessDate(),
    alerts: !!getMailer(),
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
    follow_up: followDate(body.follow_up),
  };
  if (!localSlot(c.consult_at)) throw new InputError('Invalid consult_at');
  if (!c.business && !c.phone) throw new InputError('Add the business name or phone number');
  if (c.outcome === 'booked' && (!c.consult_at || !c.email)) throw new InputError('Booked calls need a consult time and an email');
  const ids = body.question_ids === undefined ? [] : body.question_ids;
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))) throw new InputError('Invalid question_ids');
  c.question_ids = ids;
  return c;
}
function validateEdit(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid call');
  const c = validateCall({ ...body, request_key: 'edit-request', question_ids: [] });
  delete c.request_key; delete c.question_ids;
  return c;
}
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DNC_ID = /^(dnc-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
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

// One consult per time slot. Runs inside the caller's write transaction.
async function assertSlotFree(db, consultAt, exceptId) {
  const taken = await db.execute({ sql: "SELECT business FROM calldesk_calls WHERE outcome='booked' AND consult_at=? AND id<>? LIMIT 1", args: [consultAt, exceptId || ''] });
  if (taken.rows.length) throw new InputError('That time is already booked for ' + (String(taken.rows[0].business || '') || 'another prospect') + '. Offer the other time.');
}
// A do-not-call call always has a matching list entry. reactivate brings back an
// entry an owner lifted earlier, for when the same call is marked do-not-call again.
async function ensureDnc(db, { callId, business, phoneNorm, userId, reactivate }) {
  const existing = await db.execute({ sql: 'SELECT id FROM calldesk_dnc WHERE call_id=?', args: [callId] });
  if (existing.rows.length) {
    await db.execute({ sql: 'UPDATE calldesk_dnc SET business=?,phone_norm=?' + (reactivate ? ',removed_at=NULL,removed_by=NULL' : '') + ' WHERE call_id=?', args: [business, phoneNorm, callId] });
  } else {
    await db.execute({ sql: 'INSERT INTO calldesk_dnc(id,call_id,created_at,by_user,business,phone_norm) VALUES(?,?,?,?,?,?)', args: [crypto.randomUUID(), callId, Date.now(), userId, business, phoneNorm] });
  }
}
const activeDncForCall = async (db, callId) => (await db.execute({ sql: 'SELECT 1 FROM calldesk_dnc WHERE call_id=? AND removed_at IS NULL', args: [callId] })).rows.length > 0;

// Open or move a call's follow-up. An earlier closed row for the same call is reopened.
async function setFollowUp(db, callId, dueOn) {
  await db.execute({ sql: `INSERT INTO calldesk_followups(call_id,due_on,created_at) VALUES(?,?,?)
    ON CONFLICT(call_id) DO UPDATE SET due_on=excluded.due_on,done_at=NULL,done_by=NULL,done_reason=''`, args: [callId, dueOn, Date.now()] });
}
const closeFollowUp = (db, callId, userId, reason) => db.execute({ sql: 'UPDATE calldesk_followups SET done_at=?,done_by=?,done_reason=? WHERE call_id=? AND done_at IS NULL', args: [Date.now(), userId, reason, callId] });

async function addCall(client, user, body) {
  const c = validateCall(body);
  const id = crypto.randomUUID();
  const tx = await client.transaction('write');
  try {
    const existing = await tx.execute({ sql: 'SELECT id FROM calldesk_calls WHERE request_key=?', args: [c.request_key] });
    if (existing.rows.length) { await tx.commit(); return { id: String(existing.rows[0].id), replay: true }; }
    if (c.outcome === 'booked') await assertSlotFree(tx, c.consult_at, id);
    const phoneNorm = normPhone(c.phone);
    // Refusing the save would only hide the record of the call, so a call to a
    // flagged number is kept and tagged for the owner instead.
    let dncHit = false;
    if (c.outcome !== 'dnc' && phoneNorm.length === 10) {
      dncHit = (await tx.execute({ sql: 'SELECT 1 FROM calldesk_dnc WHERE phone_norm=? AND removed_at IS NULL LIMIT 1', args: [phoneNorm] })).rows.length > 0;
    }
    const notes = dncHit ? (DNC_HIT_NOTE + (c.notes ? '\n' + c.notes : '')).slice(0, 4000) : c.notes;
    await tx.execute({
      sql: `INSERT INTO calldesk_calls(id,request_key,created_at,by_user,business,phone,phone_norm,website,seen,seen_other,contact,role,dm,email,best,outcome,consult_at,consult_label,confirmed,notes)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      args: [id, c.request_key, Date.now(), user.id, c.business, c.phone, phoneNorm, c.website, c.seen, c.seen_other, c.contact, c.role, c.dm, c.email, c.best, c.outcome, c.consult_at, c.consult_label, notes],
    });
    if (c.outcome === 'dnc') await ensureDnc(tx, { callId: id, business: c.business, phoneNorm, userId: user.id });
    // Calling a prospect again settles any follow-up that was open for them.
    const byPhone = phoneNorm.length === 10 ? phoneNorm : '', byName = c.business.length > 3 ? c.business.toLowerCase() : '';
    if (byPhone || byName) {
      await tx.execute({ sql: `UPDATE calldesk_followups SET done_at=?,done_by=?,done_reason='called again' WHERE done_at IS NULL AND call_id IN
        (SELECT id FROM calldesk_calls WHERE id<>? AND ((?<>'' AND phone_norm=?) OR (?<>'' AND LOWER(TRIM(business))=?)))`, args: [Date.now(), user.id, id, byPhone, byPhone, byName, byName] });
    }
    const followUp = FOLLOWABLE.has(c.outcome) ? (c.follow_up || (c.outcome === 'callback' ? nextBusinessDate() : '')) : '';
    if (followUp) await setFollowUp(tx, id, followUp);
    for (const qid of c.question_ids) await tx.execute({ sql: 'UPDATE calldesk_questions SET call_id=? WHERE id=? AND call_id IS NULL', args: [id, qid] });
    await tx.commit();
    if (c.outcome === 'booked') alertOwner(bookedAlert(id, c, user));
    return { id, replay: false, dnc_hit: dncHit, follow_up: followUp };
  } catch (e) { await tx.rollback().catch(() => {}); throw e; } finally { tx.close(); }
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
  alertOwner(questionAlert(id, q, user, due));
  return { id, due_by: due };
}

// "Called before" across the whole log, not just the 500 rows the page holds.
async function lookup(client, query) {
  const phone = normPhone(text(query.phone, 40, { name: 'phone' }));
  const business = text(query.business, 160, { name: 'business' }).toLowerCase();
  const byPhone = phone.length === 10, byName = business.length > 3;
  if (!byPhone && !byName) return { count: 0, last: null, bad_number: false };
  const where = '(' + [byPhone ? 'phone_norm=?' : '', byName ? 'LOWER(TRIM(business))=?' : ''].filter(Boolean).join(' OR ') + ')';
  const args = [...(byPhone ? [phone] : []), ...(byName ? [business] : [])];
  const [count, last, bad] = await Promise.all([
    client.execute({ sql: 'SELECT COUNT(*) AS n FROM calldesk_calls WHERE ' + where, args }),
    client.execute({ sql: 'SELECT created_at,outcome,notes,best FROM calldesk_calls WHERE ' + where + ' ORDER BY created_at DESC LIMIT 1', args }),
    byPhone ? client.execute({ sql: "SELECT 1 FROM calldesk_calls WHERE phone_norm=? AND notes LIKE '%BAD NUMBER%' LIMIT 1", args: [phone] }) : { rows: [] },
  ]);
  const r = last.rows[0];
  return {
    count: Number(count.rows[0].n),
    last: r ? { created_at: Number(r.created_at), outcome: String(r.outcome), notes: String(r.notes || '').slice(0, 200), best: String(r.best || '') } : null,
    bad_number: bad.rows.length > 0,
  };
}
async function search(client, query) {
  const q = text(query.q, 80, { required: true, name: 'search' }).toLowerCase();
  const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';
  const digits = q.replace(/\D/g, '');
  const r = await client.execute({
    sql: CALL_SELECT + ` WHERE LOWER(c.business) LIKE ? ESCAPE '\\' OR LOWER(c.contact) LIKE ? ESCAPE '\\' OR LOWER(c.dm) LIKE ? ESCAPE '\\' OR LOWER(c.email) LIKE ? ESCAPE '\\'
      OR (?<>'' AND c.phone_norm LIKE ?) ORDER BY c.created_at DESC LIMIT 200`,
    args: [like, like, like, like, digits.length >= 3 ? digits : '', '%' + digits + '%'],
  });
  return { calls: r.rows.map(callRow) };
}

function install(router) {
  router.use([PAGE, API], (req, res, next) => {
    if (!ROLES.has(req.portalUser.role)) return res.status(403).type('text').send('The Call Desk is for the Ahern AI team.');
    next();
  });
  const ownerOnly = (req, res, next) => req.portalUser.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner can do that.' });
  const fail = (res, error, what) => {
    if (error instanceof InputError) return res.status(400).json({ error: error.message });
    // Name, code and message only: enough to tell a Turso timeout from a bug,
    // without writing prospect details into the Render log.
    const detail = [error && error.name, error && error.code, error && error.message].filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 300);
    console.error('[call-desk] ' + what + ' failed: ' + (detail || 'unknown error'));
    res.status(503).json({ error: 'The call desk could not save that. Your entry is still on screen — retry.' });
  };

  router.get(PAGE, (req, res) => res.send(page(req.portalUser)));
  router.get(API + '/state', async (req, res) => {
    try { res.json({ me: { name: req.portalUser.name, role: req.portalUser.role }, version: VERSION, ...(await state(req.portalStore.client)) }); }
    catch (e) { fail(res, e, 'state'); }
  });
  router.get(API + '/lookup', async (req, res) => {
    try { res.json(await lookup(req.portalStore.client, { phone: req.query.phone, business: req.query.business })); }
    catch (e) { fail(res, e, 'lookup'); }
  });
  router.get(API + '/calls/search', async (req, res) => {
    try { res.json(await search(req.portalStore.client, { q: req.query.q })); }
    catch (e) { fail(res, e, 'search'); }
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
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Question not found.' });
      const answer = text(req.body?.answer, 4000, { required: true, name: 'answer' });
      const r = await req.portalStore.client.execute({ sql: "UPDATE calldesk_questions SET status='answered',answer=?,answered_at=?,answered_by=? WHERE id=? AND status!='relayed'", args: [answer, Date.now(), req.portalUser.id, req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Question not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'answer'); }
  });
  router.post(API + '/questions/:id/relay', async (req, res) => {
    try {
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Question not found.' });
      const r = await req.portalStore.client.execute({ sql: "UPDATE calldesk_questions SET status='relayed',relayed_at=? WHERE id=? AND status='answered'", args: [Date.now(), req.params.id] });
      if (!r.rowsAffected) return res.status(409).json({ error: 'Only answered questions can be marked relayed.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'relay'); }
  });
  router.post(API + '/calls/:id/confirm', ownerOnly, async (req, res) => {
    try {
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Booked call not found.' });
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
  router.patch(API + '/calls/:id', ownerOnly, async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Call not found.' });
    let tx;
    try {
      const c = validateEdit(req.body);
      tx = await req.portalStore.client.transaction('write');
      const cur = await tx.execute({ sql: 'SELECT outcome,consult_at,confirmed FROM calldesk_calls WHERE id=?', args: [req.params.id] });
      if (!cur.rows.length) { await tx.rollback(); return res.status(404).json({ error: 'Call not found.' }); }
      if (c.outcome === 'booked') await assertSlotFree(tx, c.consult_at, req.params.id);
      // A confirmation only survives an edit that keeps the same booked time.
      const was = cur.rows[0];
      const keep = c.outcome === 'booked' && was.outcome === 'booked' && String(was.consult_at) === c.consult_at && Number(was.confirmed) === 1 ? 1 : 0;
      const phoneNorm = normPhone(c.phone);
      await tx.execute({
        sql: `UPDATE calldesk_calls SET business=?,phone=?,phone_norm=?,website=?,seen=?,seen_other=?,contact=?,role=?,dm=?,email=?,best=?,outcome=?,consult_at=?,consult_label=?,notes=?,
              confirmed=?,confirmed_at=CASE WHEN ?=1 THEN confirmed_at ELSE NULL END WHERE id=?`,
        args: [c.business, c.phone, phoneNorm, c.website, c.seen, c.seen_other, c.contact, c.role, c.dm, c.email, c.best, c.outcome, c.consult_at, c.consult_label, c.notes, keep, keep, req.params.id],
      });
      // Still do-not-call: the list entry follows the corrected name and number.
      // No longer do-not-call: the entry stays until an owner lifts it.
      if (c.outcome === 'dnc') await ensureDnc(tx, { callId: req.params.id, business: c.business, phoneNorm, userId: req.portalUser.id, reactivate: was.outcome !== 'dnc' });
      const dncKept = c.outcome !== 'dnc' && await activeDncForCall(tx, req.params.id);
      // Follow-up: a date sets or moves it, "Call back" never goes without one,
      // a cleared date or an outcome that needs no follow-up closes it.
      if (!FOLLOWABLE.has(c.outcome)) await closeFollowUp(tx, req.params.id, req.portalUser.id, 'outcome changed');
      else if (c.follow_up) await setFollowUp(tx, req.params.id, c.follow_up);
      else if (c.outcome === 'callback') {
        const open = await tx.execute({ sql: 'SELECT 1 FROM calldesk_followups WHERE call_id=? AND done_at IS NULL', args: [req.params.id] });
        if (!open.rows.length) await setFollowUp(tx, req.params.id, nextBusinessDate());
      } else await closeFollowUp(tx, req.params.id, req.portalUser.id, 'date cleared');
      await tx.commit();
      res.json({ ok: true, confirmed: !!keep, dnc_kept: dncKept });
    } catch (e) { if (tx) await tx.rollback().catch(() => {}); fail(res, e, 'edit'); }
    finally { if (tx) tx.close(); }
  });
  router.delete(API + '/calls/:id', ownerOnly, async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Call not found.' });
    let tx;
    try {
      tx = await req.portalStore.client.transaction('write');
      // Questions asked on the call stay in the queue; they just lose the link.
      await tx.execute({ sql: 'UPDATE calldesk_questions SET call_id=NULL WHERE call_id=?', args: [req.params.id] });
      const r = await tx.execute({ sql: 'DELETE FROM calldesk_calls WHERE id=?', args: [req.params.id] });
      if (!r.rowsAffected) { await tx.rollback(); return res.status(404).json({ error: 'Call not found.' }); }
      await tx.execute({ sql: 'DELETE FROM calldesk_followups WHERE call_id=?', args: [req.params.id] });
      // The do-not-call entry outlives the call that created it.
      const dncKept = await activeDncForCall(tx, req.params.id);
      await tx.commit();
      res.json({ ok: true, dnc_kept: dncKept });
    } catch (e) { if (tx) await tx.rollback().catch(() => {}); fail(res, e, 'delete call'); }
    finally { if (tx) tx.close(); }
  });
  router.delete(API + '/questions/:id', ownerOnly, async (req, res) => {
    try {
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Question not found.' });
      const r = await req.portalStore.client.execute({ sql: 'DELETE FROM calldesk_questions WHERE id=?', args: [req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Question not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'delete question'); }
  });
  // Follow-ups: anyone on the desk can tick one off or move its date.
  router.post(API + '/followups/:id/done', async (req, res) => {
    try {
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Follow-up not found.' });
      const r = await closeFollowUp(req.portalStore.client, req.params.id, req.portalUser.id, 'marked done');
      if (!r.rowsAffected) return res.status(404).json({ error: 'Follow-up not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'follow-up done'); }
  });
  router.put(API + '/followups/:id', async (req, res) => {
    try {
      if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Follow-up not found.' });
      const due = followDate(req.body?.due_on);
      if (!due) throw new InputError('Pick a follow-up date');
      const r = await req.portalStore.client.execute({ sql: 'UPDATE calldesk_followups SET due_on=? WHERE call_id=? AND done_at IS NULL', args: [due, req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Follow-up not found.' });
      res.json({ ok: true, due_on: due });
    } catch (e) { fail(res, e, 'follow-up move'); }
  });
  // Lifting a flag keeps the row (removed_at) so there is a record of who lifted it.
  router.delete(API + '/dnc/:id', ownerOnly, async (req, res) => {
    try {
      if (!DNC_ID.test(req.params.id)) return res.status(404).json({ error: 'Do-not-call entry not found.' });
      const r = await req.portalStore.client.execute({ sql: 'UPDATE calldesk_dnc SET removed_at=?,removed_by=? WHERE id=? AND removed_at IS NULL', args: [Date.now(), req.portalUser.id, req.params.id] });
      if (!r.rowsAffected) return res.status(404).json({ error: 'Do-not-call entry not found.' });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'lift do-not-call'); }
  });
  router.all(API + '/*', (req, res) => res.status(404).json({ error: 'Not found.' }));
}

module.exports = { install, page, state, lookup, search, validateCall, validateEdit, validateQuestion, nextBusinessDay, nextBusinessDate, normPhone, normBiz, setMailer, VERSION, PAGE, API };
