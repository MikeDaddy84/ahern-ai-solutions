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
      subject: `Ahern AI consultation #${lead.id}`,
      text: [`New consultation request #${lead.id}`, '', `Name: ${lead.name}`, `Email: ${lead.email}`,
        `Business: ${lead.business || '—'}`, `Interest: ${lead.interest}`, '', lead.message || '(No message)', '', `Received: ${lead.created_at} UTC`].join('\n')
    };
    if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ahern-lead-${lead.id}` },
        body: JSON.stringify(message)
      });
      if (!res.ok) throw new Error('Notification delivery failed');
    } else {
      const result = await transport.sendMail(message);
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Notification not accepted');
    }
  };
}
module.exports = { configured, createSender };
