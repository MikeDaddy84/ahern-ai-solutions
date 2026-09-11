const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { createClient } = require('@libsql/client');
const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'ahern_portal';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) throw new Error('Use a password between 14 and 256 characters.');
  const salt = token();
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [, salt, expected] = String(stored || '').split(':');
  const actual = await scrypt(typeof password === 'string' ? password.slice(0, 256) : '', salt || 'invalid-account-salt', 64);
  const known = /^[a-f0-9]{128}$/.test(expected || '') ? Buffer.from(expected, 'hex') : Buffer.alloc(64);
  return crypto.timingSafeEqual(actual, known) && !!expected;
}
function createStore(client) {
  let ready;
  function prepare() {
    if (!ready) ready = client.batch(require('./portal-db').statements(), 'write').catch(err => { ready = null; throw err; });
    return ready;
  }
  return {
    client, prepare,
    async login(email, password) {
      await prepare();
      const { rows } = await client.execute({sql:'SELECT * FROM portal_users WHERE email = ?',args:[String(email || '').trim().toLowerCase()]});
      const user = rows[0];
      if (!await verifyPassword(password, user?.password_hash) || !user || user.disabled) return null;
      const value = token();
      await client.batch([
        {sql:'DELETE FROM portal_sessions WHERE expires_at <= ?', args:[Date.now()]},
        {sql:'INSERT INTO portal_sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)', args:[digest(value),user.id,token(),Date.now()+SESSION_MS]}
      ], 'write');
      return value;
    },
    async session(value) {
      if (!/^[a-f0-9]{64}$/.test(value || '')) return null;
      await prepare();
      const {rows} = await client.execute({sql:`SELECT u.id,u.email,u.name,u.workspace_key,u.role,s.csrf FROM portal_sessions s JOIN portal_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`,args:[digest(value),Date.now()]});
      return rows[0] || null;
    },
    async logout(value) { await prepare(); await client.execute({sql:'DELETE FROM portal_sessions WHERE token_hash=?',args:[digest(value || '')]}); },
    async profile(id, name) { await prepare(); await client.execute({sql:'UPDATE portal_users SET name=? WHERE id=?',args:[name,id]}); },
    async provision({email, name, password, workspace, role='member'}) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || !name?.trim() || name.length>80 || !/^[a-z0-9_-]{1,64}$/.test(workspace || '') || !['owner','employee','client','member'].includes(role)) throw new Error('Invalid account details.');
      const passwordHash = await hashPassword(password);
      await prepare();
      const normalized = email.trim().toLowerCase();
      await client.batch([
        {sql:'DELETE FROM portal_sessions WHERE user_id IN (SELECT id FROM portal_users WHERE email=?)',args:[normalized]},
        {sql:`INSERT INTO portal_users(id,email,name,password_hash,workspace_key,role) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,workspace_key=excluded.workspace_key,role=excluded.role,disabled=0`,args:[crypto.randomUUID(),normalized,name.trim(),passwordHash,workspace,role]}
      ],'write');
    }
  };
}
let defaultStore;
function getStore() {
  const config = require('./portal-db').configuration();
  if (!config) return null;
  if (!defaultStore) defaultStore = createStore(createClient(config));
  return defaultStore;
}
function readCookie(req) {
  const match=(req.headers.cookie || '').match(/(?:^|;\s*)ahern_portal=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] || '';
}
function sameOrigin(req) {
  if (req.get('sec-fetch-site') === 'cross-site') return false;
  const origin=req.get('origin');
  try {
    const expected=process.env.NODE_ENV === 'production' ? new URL(process.env.SITE_URL || 'https://ahernai.com').origin : `${req.protocol}://${req.get('host')}`;
    return origin === expected;
  } catch { return false; }
}
function cookieOptions() { return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:SESSION_MS}; }
module.exports = { createStore, getStore, hashPassword, verifyPassword, readCookie, sameOrigin, cookieOptions, COOKIE };
