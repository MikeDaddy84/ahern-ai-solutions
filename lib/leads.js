const crypto = require('node:crypto');

// Separate, additive tables preserve all existing contact submissions.
async function prepare(client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS contact_receipts (
      request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
      contact_id INTEGER NOT NULL UNIQUE REFERENCES contact_submissions(id))`,
    `CREATE TABLE IF NOT EXISTS lead_notifications (
      contact_id INTEGER PRIMARY KEY REFERENCES contact_submissions(id),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, sent_at TEXT, last_error TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_lead_notifications_due
      ON lead_notifications(next_attempt) WHERE sent_at IS NULL`
  ], 'write');
}

function fingerprint(lead) {
  return crypto.createHash('sha256').update(JSON.stringify([lead.name, lead.email, lead.business, lead.interest, lead.message])).digest('hex');
}

async function accept(client, lead, requestId) {
  const tx = await client.transaction('write');
  try {
    const hash = fingerprint(lead);
    const prior = await tx.execute({ sql: 'SELECT contact_id, payload_hash FROM contact_receipts WHERE request_id = ?', args: [requestId] });
    if (prior.rows.length) {
      if (prior.rows[0].payload_hash !== hash) { const err = new Error('Request already used'); err.status = 409; throw err; }
      await tx.commit(); return { id: Number(prior.rows[0].contact_id), duplicate: true };
    }
    const inserted = await tx.execute({
      sql: `INSERT INTO contact_submissions (name, email, business, interest, message, referrer, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [lead.name, lead.email, lead.business, lead.interest, lead.message, lead.referrer, lead.userAgent]
    });
    const id = Number(inserted.lastInsertRowid);
    await tx.execute({ sql: 'INSERT INTO contact_receipts (request_id, payload_hash, contact_id) VALUES (?, ?, ?)', args: [requestId, hash, id] });
    await tx.execute({ sql: 'INSERT INTO lead_notifications (contact_id) VALUES (?)', args: [id] });
    await tx.commit(); return { id, duplicate: false };
  } catch (err) { await tx.rollback().catch(() => {}); throw err; }
  finally { tx.close(); }
}

async function deliverBatch(client, send, now = Date.now()) {
  const pending = await client.execute({
    sql: `SELECT contact_id FROM lead_notifications WHERE sent_at IS NULL AND next_attempt <= ? AND lease_until <= ? ORDER BY next_attempt LIMIT 10`, args: [now, now]
  });
  for (const row of pending.rows) {
    const lease = await client.execute({
      sql: `UPDATE lead_notifications SET lease_until = ?, attempts = attempts + 1 WHERE contact_id = ? AND sent_at IS NULL AND lease_until <= ? RETURNING attempts`,
      args: [Date.now() + 120000, row.contact_id, Date.now()]
    });
    if (!lease.rows.length) continue;
    try {
      const contact = await client.execute({ sql: 'SELECT * FROM contact_submissions WHERE id = ?', args: [row.contact_id] });
      if (!contact.rows.length) throw new Error('contact_missing');
      await send(contact.rows[0]);
      await client.execute({ sql: `UPDATE lead_notifications SET sent_at = datetime('now'), lease_until = 0, last_error = NULL WHERE contact_id = ?`, args: [row.contact_id] });
    } catch (_) {
      // Never store SMTP/API responses: they can contain credentials or message text.
      const delay = Math.min(3600000, 60000 * 2 ** Math.min(Number(lease.rows[0].attempts) - 1, 6));
      await client.execute({ sql: `UPDATE lead_notifications SET lease_until = 0, next_attempt = ?, last_error = 'Delivery failed; retry scheduled' WHERE contact_id = ?`, args: [Date.now() + delay, row.contact_id] });
    }
  }
}

async function list(client) {
  return (await client.execute(`SELECT c.*, n.sent_at, n.attempts, n.last_error,
    CASE WHEN n.contact_id IS NULL THEN 'Legacy submission' WHEN n.sent_at IS NOT NULL THEN 'Notified' ELSE 'Notification queued' END AS delivery
    FROM contact_submissions c LEFT JOIN lead_notifications n ON n.contact_id = c.id ORDER BY c.id DESC LIMIT 100`)).rows;
}
module.exports = { prepare, accept, deliverBatch, list };
