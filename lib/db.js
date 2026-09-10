// Turso connection with lazy retries. Page views are best effort.
// Contact acceptance is atomic and durable through lib/leads.js; an outage
// returns a recoverable form error, and no inquiry contents are logged.

const { createClient } = require('@libsql/client');
const leads = require('./leads');

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
      )`,
      `CREATE TABLE IF NOT EXISTS site_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, service TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`
    ],
    'write'
  );
  await leads.prepare(client);
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
        'Site continues serving; contact requests will report a retryable error.'
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

async function withClient(run) { await ensureReady(); return run(client); }

// Run a write, converting any DB-side failure into persisted:false. Never
// throws — the caller's job is to serve a page, not to babysit Turso.
async function attemptWrite(label, run, fallbackPayload) {
  if (!client) {
    return { persisted: false, reason: 'not_configured' };
  }
  try {
    await ensureReady();
    await run();
    return { persisted: true };
  } catch (err) {
    return { persisted: false, reason: 'unreachable', error: describeError(err) };
  }
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

const EVENTS = new Set(['service_selected','assessment_completed','demo_completed','quote_requested','inquiry_received']);
const SERVICES = new Set(['automation','custom-pcs','local-ai','websites']);
function validEvent(body) { return body && EVENTS.has(body.event) && SERVICES.has(body.service); }
async function insertEvent(body) {
  if (!validEvent(body)) return { persisted: false };
  return attemptWrite('event', () => client.execute({ sql: 'INSERT INTO site_events (event, service) VALUES (?, ?)', args: [body.event, body.service] }));
}
async function eventCounts(client) {
  return (await client.execute(`SELECT event, service, COUNT(*) AS count FROM site_events
    WHERE created_at >= datetime('now', '-30 days') GROUP BY service, event ORDER BY service, event`)).rows;
}
module.exports = { isEnabled, isReady, status, whenReady, withClient, insertPageview, validEvent, insertEvent, eventCounts };
