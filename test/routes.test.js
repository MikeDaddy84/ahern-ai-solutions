const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
// Tests deliberately run without any production connection or email credentials.
delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
delete process.env.RESEND_API_KEY; delete process.env.SMTP_HOST; delete process.env.SITE_GATE_PASSWORD;
const app = require('../server');
let server, origin;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());
test('pages, self-hosted 3D libraries, and service sitemap are available', async () => {
  for (const path of ['/pc-builder', '/services/automation', '/services/custom-pcs', '/services/local-ai', '/services/websites', '/vendor/three/three.module.js', '/vendor/three-addons/environments/RoomEnvironment.js', '/builder-scene.mjs']) assert.equal((await fetch(origin + path)).status, 200, path);
  assert.match(await (await fetch(origin + '/sitemap.xml')).text(), /services\/local-ai/);
});
test('audience journeys retain content, valid destinations, metadata, and inquiry handoffs', async () => {
  const paths = ['/', '/services/automation', '/services/custom-pcs', '/services/local-ai', '/services/websites', '/pc-builder', '/resources'];
  const docs = new Map();
  for (const path of paths) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    docs.set(path, new JSDOM(await response.text()).window.document);
  }
  const home = docs.get('/');
  assert.equal(home.querySelectorAll('.audience-paths a').length, 4);
  assert.equal(home.querySelectorAll('.home-services > .pillar-card').length, 4);
  assert.ok(home.querySelector('#services'));
  assert.ok(home.querySelector('.founder-section'));
  assert.equal(home.querySelectorAll('.grid-pricing, .web-tiers, #hero-demo, [data-workflow-demo]').length, 0);
  assert.ok(docs.get('/services/automation').querySelector('#pricing .grid-pricing'));
  assert.ok(docs.get('/services/automation').querySelector('[data-workflow-demo]'));
  assert.ok(docs.get('/services/websites').querySelector('#web .web-tiers'));
  const pc = docs.get('/services/custom-pcs');
  assert.equal(pc.querySelector('#hero-demo').dataset.defaultTrack, 'gaming');
  const scripts = [...pc.querySelectorAll('script[src]')].map(el => el.getAttribute('src'));
  assert.ok(scripts.findIndex(src => src.startsWith('/pricing.js')) < scripts.findIndex(src => src.startsWith('/script.js')));
  const titles = new Set();
  const interests = [...home.querySelectorAll('#interest option')].map(el => el.value);
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
  for (const [path, doc] of docs) {
    assert.equal(doc.querySelectorAll('h1').length, 1, path);
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id on ' + path);
    for (const el of doc.querySelectorAll('a[href]')) {
      const url = new URL(el.getAttribute('href'), origin + path);
      if (url.origin !== origin) continue;
      const target = docs.get(url.pathname);
      if (target && url.hash) assert.ok(target.getElementById(decodeURIComponent(url.hash.slice(1))), path + ' → ' + url.href);
      if (url.searchParams.has('interest')) assert.ok(interests.includes(url.searchParams.get('interest')), url.href);
    }
    if (path.startsWith('/services/')) {
      titles.add(doc.title);
      assert.ok(doc.querySelector('meta[name="description"]').content);
      assert.equal(new URL(doc.querySelector('link[rel="canonical"]').href).pathname, path);
      assert.equal(new URL(doc.querySelector('meta[property="og:url"]').content).pathname, path);
      assert.ok(sitemap.includes(path), path);
      assert.ok(doc.querySelector('a[href*="interest="]'), 'service consultation: ' + path);
    }
  }
  assert.equal(titles.size, 4);
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
