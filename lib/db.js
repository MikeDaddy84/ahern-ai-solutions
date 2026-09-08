// =============================================================================
//  lib/db.js — Turso (libSQL) connection, schema bootstrap, and write helpers
// -----------------------------------------------------------------------------
//  Version : 2.0.0
//  Author  : Mike Ahern (Ahern AI)
//  Written by : Claude Opus 5 (claude-opus-5)
//  Changed : 2026-09-08
//
//  v2.0.0 — Stop a database blip from killing the whole site.
//    v1 fired init() at module load and stored the promise without a catch. If
//    Turso was slow or unreachable the rejection was unhandled, and Node >=15
//    turns that into an uncaught exception, so the process died about ten
//    seconds after boot — before any request ever touched the DB. On Render
//    that was a permanent restart loop: a marketing site taken down by a
//    contact form nobody had submitted.
//
//    Now: init() is retried lazily with backoff, its promise is never left
//    unhandled, and the site serves every page whether or not the DB answers.
//    Writes that cannot reach Turso are logged in full to stdout under
//    [contact][UNPERSISTED] so a lead is never silently lost, and report
//    persisted:false to the caller rather than throwing.
//
//  Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
//       Both unset = DB disabled; the site runs, writes are logged only.
// =============================================================================

const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Retry schedule for schema bootstrap. Turso connect timeouts are ~10s, so
// these are the gaps *between* attempts, not the total wait.
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];
const MAX_RETRY_DELAY_MS = 60000;

let client = null;
let ready = false; // true once the schema is confirmed present
let initPromise = null; // in-flight init, if any
let attempt = 0;
let lastError = null;
let warmupTimer = null;

if (url) {
  client = createClient({ url, authToken });
  // Warm the connection in the background. .catch() is attached synchronously
  // here — that is the entire bug fix. Failure schedules a retry; it never
  // becomes an unhandled rejection.
  ensureReady().catch(() => {});
} else {
  console.warn(
    '[db] TURSO_DATABASE_URL not set — contact form and analytics will not persist. ' +
    'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment to enable them.'
  );
}

// -----------------------------------------------------------------------------
// Schema bootstrap
// -----------------------------------------------------------------------------

async function init() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS contact_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        business TEXT,
        interest TEXT,
        message TEXT,
        referrer TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS pageviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        referrer TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ],
    'write'
  );
}

// Resolves when the schema is ready; rejects if this attempt failed. Callers
// MUST handle the rejection — every call site in this file does.
function ensureReady() {
  if (!client) return Promise.reject(new Error('[db] not configured'));
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  attempt += 1;
  const thisAttempt = attempt;

  initPromise = init()
    .then(() => {
      ready = true;
      lastError = null;
      attempt = 0;
      initPromise = null;
      clearRetry();
      console.log('[db] Turso connected, schema ready.');
    })
    .catch((err) => {
      initPromise = null;
      lastError = err;
      console.error(
        `[db] connection attempt ${thisAttempt} failed: ${describeError(err)}. ` +
        'Site continues serving; writes will be logged instead of persisted.'
      );
      scheduleRetry(thisAttempt);
      throw err;
    });

  return initPromise;
}

function scheduleRetry(failedAttempt) {
  if (warmupTimer) return; // one pending retry at a time
  const delay = RETRY_DELAYS_MS[Math.min(failedAttempt - 1, RETRY_DELAYS_MS.length - 1)] || MAX_RETRY_DELAY_MS;
  console.warn(`[db] retrying connection in ${Math.round(delay / 1000)}s.`);
  warmupTimer = setTimeout(() => {
    warmupTimer = null;
    ensureReady().catch(() => {}); // rejection handled: retry is rescheduled inside
  }, delay);
  // Do not hold the event loop open purely to retry a DB connection.
  if (typeof warmupTimer.unref === 'function') warmupTimer.unref();
}

function clearRetry() {
  if (warmupTimer) {
    clearTimeout(warmupTimer);
    warmupTimer = null;
  }
}

function describeError(err) {
  const cause = err && err.cause;
  const code = (cause && cause.code) || (err && err.code);
  const msg = (err && err.message) || String(err);
  return code ? `${msg} (${code})` : msg;
}

// -----------------------------------------------------------------------------
// Public surface
// -----------------------------------------------------------------------------

// Is a database configured at all? (Kept for backwards compatibility — this
// answers "are the env vars set", NOT "is the DB reachable".)
function isEnabled() {
  return !!client;
}

// Is the database actually connected and the schema confirmed?
function isReady() {
  return ready;
}

// Machine-readable state for /health.
function status() {
  if (!client) return { configured: false, connected: false, state: 'not_configured' };
  if (ready) return { configured: true, connected: true, state: 'connected' };
  return {
    configured: true,
    connected: false,
    state: 'unreachable',
    lastError: lastError ? describeError(lastError) : null
  };
}

async function whenReady() {
  await ensureReady();
}

// Run a write, converting any DB-side failure into persisted:false. Never
// throws — the caller's job is to serve a page, not to babysit Turso.
async function attemptWrite(label, run, fallbackPayload) {
  if (!client) {
    logUnpersisted(label, fallbackPayload, 'db not configured');
    return { persisted: false, reason: 'not_configured' };
  }
  try {
    await ensureReady();
    await run();
    return { persisted: true };
  } catch (err) {
    logUnpersisted(label, fallbackPayload, describeError(err));
    return { persisted: false, reason: 'unreachable', error: describeError(err) };
  }
}

// A contact submission that missed the database still has to survive. Render
// keeps stdout, so this line is the recovery path — grep [UNPERSISTED].
function logUnpersisted(label, payload, reason) {
  if (label === 'pageview') return; // analytics are not worth the log noise
  console.error(
    `[${label}][UNPERSISTED] ${reason} :: ${JSON.stringify(payload)}`
  );
}

async function insertContact({ name, email, business, interest, message, referrer, userAgent }) {
  return attemptWrite(
    'contact',
    () =>
      client.execute({
        sql: `INSERT INTO contact_submissions (name, email, business, interest, message, referrer, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [name, email, business || null, interest || null, message || null, referrer || null, userAgent || null]
      }),
    { name, email, business, interest, message, referrer }
  );
}

async function insertPageview({ path, referrer, userAgent }) {
  return attemptWrite(
    'pageview',
    () =>
      client.execute({
        sql: `INSERT INTO pageviews (path, referrer, user_agent) VALUES (?, ?, ?)`,
        args: [path, referrer || null, userAgent || null]
      }),
    { path, referrer }
  );
}

module.exports = { isEnabled, isReady, status, whenReady, insertContact, insertPageview };
