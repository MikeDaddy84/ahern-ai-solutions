// Turso (libSQL) connection + schema bootstrap.
//
// Requires env vars TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
// If they're missing (e.g. local dev without a DB), the site still runs —
// contact/analytics endpoints just log a warning and respond gracefully
// instead of crashing the whole server.

const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let client = null;
let ready = null;

if (url) {
  client = createClient({ url, authToken });
  ready = init();
} else {
  console.warn(
    '[db] TURSO_DATABASE_URL not set — contact form and analytics will not persist. ' +
    'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment to enable them.'
  );
}

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
  console.log('[db] Turso connected, schema ready.');
}

function isEnabled() {
  return !!client;
}

async function whenReady() {
  if (ready) await ready;
}

async function insertContact({ name, email, business, interest, message, referrer, userAgent }) {
  if (!client) return { persisted: false };
  await whenReady();
  await client.execute({
    sql: `INSERT INTO contact_submissions (name, email, business, interest, message, referrer, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [name, email, business || null, interest || null, message || null, referrer || null, userAgent || null]
  });
  return { persisted: true };
}

async function insertPageview({ path, referrer, userAgent }) {
  if (!client) return { persisted: false };
  await whenReady();
  await client.execute({
    sql: `INSERT INTO pageviews (path, referrer, user_agent) VALUES (?, ?, ?)`,
    args: [path, referrer || null, userAgent || null]
  });
  return { persisted: true };
}

module.exports = { isEnabled, whenReady, insertContact, insertPageview };
