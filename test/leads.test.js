const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@libsql/client');
const leads = require('../lib/leads');
const { validate } = require('../lib/contact');
const notifications = require('../lib/notifications');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const sample = { name: 'Example visitor', email: 'example@example.test', business: '', interest: 'AI automation', message: 'A sample workflow inquiry', referrer: null, userAgent: 'test' };
async function fixture() {
  // libSQL opens a new connection after interactive transactions; a file keeps
  // schema/data across those connections, like the production database does.
  const client = createClient({ url: 'file:' + path.join(os.tmpdir(), 'ahern-leads-test-' + crypto.randomUUID() + '.db').replace(/\\/g, '/') });
  await client.execute(`CREATE TABLE contact_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, business TEXT, interest TEXT, message TEXT, referrer TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await client.execute({ sql: `INSERT INTO contact_submissions (name, email) VALUES (?, ?)`, args: ['Existing lead', 'prior@example.test'] });
  await leads.prepare(client); return client;
}
test('additive migration preserves existing leads and is repeatable', async () => {
  const client = await fixture(); await leads.prepare(client);
  assert.equal((await leads.list(client))[0].delivery, 'Legacy submission'); client.close();
});
test('contact and notification commit together, with duplicate retry protection', async () => {
  const client = await fixture(); const first = await leads.accept(client, sample, 'request-123456789');
  const again = await leads.accept(client, sample, 'request-123456789');
  assert.equal(first.id, again.id); assert.equal(again.duplicate, true);
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM lead_notifications')).rows[0].n, 1);
  await assert.rejects(leads.accept(client, { ...sample, message: 'different' }, 'request-123456789'), { status: 409 });
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM contact_submissions')).rows[0].n, 2); client.close();
});
test('transaction failure rolls back the contact instead of claiming partial success', async () => {
  const client = await fixture(); await client.execute('DROP TABLE lead_notifications');
  await assert.rejects(leads.accept(client, sample, 'request-123456789'));
  assert.equal((await client.execute('SELECT COUNT(*) AS n FROM contact_submissions')).rows[0].n, 1); client.close();
});
test('failed notifications remain queued and retry successfully without sensitive error logs', async () => {
  const client = await fixture(); await leads.accept(client, sample, 'request-123456789');
  await leads.deliverBatch(client, async () => { throw new Error('secret-provider-key'); });
  let row = (await client.execute('SELECT * FROM lead_notifications')).rows[0];
  assert.equal(row.sent_at, null); assert.equal(row.attempts, 1); assert.ok(!row.last_error.includes('secret'));
  await client.execute('UPDATE lead_notifications SET next_attempt = 0');
  let sent = 0; await leads.deliverBatch(client, async lead => { assert.equal(lead.email, sample.email); sent++; });
  await leads.deliverBatch(client, async () => { sent++; });
  assert.equal(sent, 1); row = (await client.execute('SELECT * FROM lead_notifications')).rows[0]; assert.ok(row.sent_at); client.close();
});
test('live notifications require explicitly configured destination and credentials', () => {
  assert.equal(notifications.configured({}), false); assert.equal(notifications.createSender({}), null);
  assert.equal(notifications.configured({ RESEND_API_KEY: 'example', LEAD_NOTIFY_TO: 'owner@example.test', LEAD_NOTIFY_FROM: 'site@example.test' }), true);
});
test('contact validation rejects malformed types, whitespace names, unknown services and overlong messages', () => {
  for (const change of [{ name: '  ' }, { email: 'not-an-email' }, { name: {} }, { interest: 'unknown' }, { message: 'x'.repeat(4001) }]) assert.throws(() => validate({ ...sample, ...change }));
  assert.equal(validate(sample).lead.name, sample.name);
});
