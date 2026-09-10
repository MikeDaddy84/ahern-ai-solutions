const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { createSender } = require('../lib/notifications');

const env = { LEAD_NOTIFY_TO: 'owner@example.test', LEAD_NOTIFY_FROM: 'Ahern AI <hello@example.test>' };
const lead = { id: 42, name: 'Example customer', email: 'customer@example.test', business: '', interest: 'Custom gaming PC', message: 'Please quote my build.\nBudget: $2,000', created_at: '2026-09-10 12:00:00' };

test('Resend delivers only to the configured owner, with customer Reply-To and stable retry identity', async t => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, ...options });
    return new Response(JSON.stringify({ id: 'test-message' }), { status: 200 });
  });
  const send = createSender({ ...env, RESEND_API_KEY: 'test-key' });
  await send(lead); await send(lead);
  const message = JSON.parse(requests[0].body);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(message.to, env.LEAD_NOTIFY_TO);
  assert.equal(message.from, env.LEAD_NOTIFY_FROM);
  assert.equal(message.reply_to, lead.email);
  assert.equal(message.replyTo, undefined);
  assert.equal(message.cc, undefined); assert.equal(message.bcc, undefined);
  assert.match(message.subject, /#42: Custom gaming PC/);
  assert.ok(message.text.includes(lead.message));
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
});

test('provider rejection and network failure reject delivery so the outbox can retry', async t => {
  const send = createSender({ ...env, RESEND_API_KEY: 'test-key' });
  const mock = t.mock.method(global, 'fetch', async () => new Response('private provider details', { status: 429 }));
  await assert.rejects(send(lead), { message: 'Notification delivery failed' });
  mock.mock.mockImplementation(async () => { throw new Error('Network unavailable'); });
  await assert.rejects(send(lead));
});

test('SMTP encodes customer Reply-To while retaining the configured sender and destination', async t => {
  // Exercise Nodemailer message generation without opening a network connection.
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  let generated;
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => {
    generated = await composer.sendMail(message);
    return { accepted: [env.LEAD_NOTIFY_TO], rejected: [] };
  } }));
  const send = createSender({ ...env, SMTP_HOST: 'smtp.example.test', SMTP_USER: 'test-user', SMTP_PASSWORD: 'test-password' });
  await send(lead);
  assert.deepEqual(generated.envelope.to, [env.LEAD_NOTIFY_TO]);
  assert.equal(generated.envelope.from, 'hello@example.test');
  assert.match(generated.message.toString(), /Reply-To: customer@example\.test/);
});
