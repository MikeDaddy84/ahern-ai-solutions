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
      ON lead_notifications(next_attempt) WHERE sent_at IS NULL`,
    `CREATE TABLE IF NOT EXISTS lead_pipeline (
      contact_id INTEGER PRIMARY KEY REFERENCES contact_submissions(id),
      stage TEXT NOT NULL DEFAULT 'new', revenue REAL, direct_cost REAL,
      delivery_hours REAL, outcome_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))`
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
    await tx.execute({ sql: 'INSERT INTO lead_pipeline (contact_id) VALUES (?)', args: [id] });
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
    COALESCE(p.stage, 'new') AS stage, p.revenue, p.direct_cost, p.delivery_hours, p.outcome_note,
    CASE WHEN n.contact_id IS NULL THEN 'Legacy submission' WHEN n.sent_at IS NOT NULL THEN 'Notified' ELSE 'Notification queued' END AS delivery
    FROM contact_submissions c LEFT JOIN lead_notifications n ON n.contact_id = c.id
    LEFT JOIN lead_pipeline p ON p.contact_id = c.id ORDER BY c.id DESC LIMIT 100`)).rows;
}
const STAGES = ['new', 'qualified', 'proposal', 'won', 'lost'];
function validatePipeline(body) {
  if (!STAGES.includes(body.stage)) throw new Error('Choose a valid stage.');
  const values = { stage: body.stage };
  for (const key of ['revenue','direct_cost','delivery_hours']) {
    const raw = body[key];
    if (raw == null || raw === '') { values[key] = null; continue; }
    if (typeof raw !== 'string' || !/^(?:\d+)(?:\.\d{1,2})?$/.test(raw) || Number(raw) > (key === 'delivery_hours' ? 100000 : 10000000)) throw new Error('Use a non-negative number with up to two decimal places.');
    values[key] = Number(raw);
  }
  if (body.outcome_note != null && (typeof body.outcome_note !== 'string' || body.outcome_note.length > 600)) throw new Error('Keep the outcome note under 600 characters.');
  values.outcome_note = (body.outcome_note || '').trim();
  return values;
}
async function updatePipeline(client, id, values) {
  const exists = await client.execute({ sql: 'SELECT id FROM contact_submissions WHERE id = ?', args: [id] });
  if (!exists.rows.length) return false;
  await client.execute({ sql: `INSERT INTO lead_pipeline (contact_id, stage, revenue, direct_cost, delivery_hours, outcome_note) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_id) DO UPDATE SET stage=excluded.stage, revenue=excluded.revenue, direct_cost=excluded.direct_cost, delivery_hours=excluded.delivery_hours, outcome_note=excluded.outcome_note, updated_at=datetime('now')`,
    args: [id, values.stage, values.revenue, values.direct_cost, values.delivery_hours, values.outcome_note] });
  return true;
}
module.exports = { prepare, accept, deliverBatch, list, STAGES, validatePipeline, updatePipeline };
