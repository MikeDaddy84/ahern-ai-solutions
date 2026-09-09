const test = require('node:test');
const assert = require('node:assert/strict');
// Tests deliberately run without any production connection or email credentials.
delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
delete process.env.RESEND_API_KEY; delete process.env.SMTP_HOST; delete process.env.SITE_GATE_PASSWORD;
const app = require('../server');
let server, origin;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());
test('pages, self-hosted 3D libraries, and service sitemap are available', async () => {
  for (const path of ['/pc-builder', '/services/automation', '/services/custom-pcs', '/services/local-ai', '/vendor/three/three.module.js', '/vendor/three-addons/environments/RoomEnvironment.js', '/builder-scene.mjs']) assert.equal((await fetch(origin + path)).status, 200, path);
  assert.match(await (await fetch(origin + '/sitemap.xml')).text(), /services\/local-ai/);
});
test('database outage returns a recoverable error, never a false success', async () => {
  const response = await fetch(origin + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Example', email: 'example@example.test', interest: 'AI automation' }) });
  assert.equal(response.status, 503); const body = await response.json(); assert.ok(body.error); assert.notEqual(body.ok, true);
});
test('private inbox stays inaccessible without separate credentials', async () => {
  delete process.env.LEADS_DASHBOARD_PASSWORD; assert.equal((await fetch(origin + '/leads')).status, 404);
  process.env.LEADS_DASHBOARD_PASSWORD = 'a-long-test-only-password';
  const response = await fetch(origin + '/leads'); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
  const invalid = await fetch(origin + '/leads', { headers: { Authorization: 'Basic ' + Buffer.from('mike:incorrect').toString('base64') } }); assert.equal(invalid.status, 401);
  delete process.env.LEADS_DASHBOARD_PASSWORD;
});
