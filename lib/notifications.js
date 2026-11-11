const nodemailer = require('nodemailer');

function configured(env = process.env) {
  return !!(env.LEAD_NOTIFY_TO && env.LEAD_NOTIFY_FROM && (env.RESEND_API_KEY || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD)));
}

function createSender(env = process.env) {
  if (!configured(env)) return null;
  const transport = env.RESEND_API_KEY ? null : nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_PORT === '465', requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true
  });
  return async lead => {
    const message = {
      from: env.LEAD_NOTIFY_FROM, to: env.LEAD_NOTIFY_TO,
      replyTo: lead.email,
      subject: `Ahern AI inquiry #${lead.id}: ${String(lead.interest || 'Consultation').replace(/[\r\n]/g, ' ')}`,
      text: [`New consultation request #${lead.id}`, '', `Name: ${lead.name}`, `Email: ${lead.email}`,
        `Business: ${lead.business || '—'}`, `Interest: ${lead.interest}`, '', lead.message || '(No message)', '',
        'Reply to this email to respond directly to the customer.', `Received: ${lead.created_at} UTC`].join('\n')
    };
    if (env.RESEND_API_KEY) {
      // The HTTP API uses snake_case; Nodemailer uses replyTo.
      const { replyTo, ...payload } = message;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ahern-lead-${lead.id}` },
        body: JSON.stringify({ ...payload, reply_to: replyTo })
      });
      if (!res.ok) throw new Error('Notification delivery failed');
    } else {
      const result = await transport.sendMail(message);
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Notification not accepted');
    }
  };
}
// General-purpose sender for internal alerts (the Call Desk uses it). Same
// transport and env as lead notifications. Recipient is CALLDESK_NOTIFY_TO when
// set, otherwise LEAD_NOTIFY_TO. Returns null when mail is not configured.
function createMailer(env = process.env) {
  if (!configured(env)) return null;
  const from = env.CALLDESK_NOTIFY_FROM || env.LEAD_NOTIFY_FROM, to = env.CALLDESK_NOTIFY_TO || env.LEAD_NOTIFY_TO;
  const transport = env.RESEND_API_KEY ? null : nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_PORT === '465', requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true
  });
  return async ({ subject, text, replyTo, key }) => {
    const message = { from, to, subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200), text: String(text) };
    if (replyTo) message.replyTo = replyTo;
    if (env.RESEND_API_KEY) {
      const { replyTo: reply, ...payload } = message;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
        body: JSON.stringify(reply ? { ...payload, reply_to: reply } : payload)
      });
      if (!res.ok) throw new Error('Alert delivery failed (' + res.status + ')');
    } else {
      const result = await transport.sendMail(message);
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Alert not accepted');
    }
  };
}
module.exports = { configured, createSender, createMailer };
