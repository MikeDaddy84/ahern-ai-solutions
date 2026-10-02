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
  for (const path of ['/pc-builder', '/services/ai-phone-agents', '/services/automation', '/services/custom-pcs', '/services/local-ai', '/services/websites', '/services/networks-cabling', '/phone-agents.css', '/phone-home.css', '/vendor/three/three.module.js', '/vendor/three-addons/environments/RoomEnvironment.js', '/builder-scene.mjs']) assert.equal((await fetch(origin + path)).status, 200, path);
  assert.match(await (await fetch(origin + '/sitemap.xml')).text(), /services\/local-ai/);
});
test('audience journeys retain content, valid destinations, metadata, and inquiry handoffs', async () => {
  const paths = ['/', '/services/ai-phone-agents', '/services/automation', '/services/custom-pcs', '/services/local-ai', '/services/websites', '/services/networks-cabling', '/pc-builder', '/resources'];
  const docs = new Map();
  for (const path of paths) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    docs.set(path, new JSDOM(await response.text()).window.document);
  }
  const home = docs.get('/');
  assert.equal(home.querySelectorAll('.home-services > .pillar-card').length, 5);
  for (const service of ['automation', 'custom-pcs', 'local-ai', 'websites', 'networks-cabling']) assert.ok(home.querySelector('#services a[href="/services/' + service + '"]'), 'broader service remains accessible: ' + service);
  assert.ok(home.querySelector('#services'));
  assert.ok(home.querySelector('.founder-section'));
  assert.equal(home.querySelectorAll('.grid-pricing, .web-tiers, #hero-demo, [data-workflow-demo]').length, 0);
  assert.ok(docs.get('/services/automation').querySelector('#pricing .grid-pricing'));
  assert.ok(docs.get('/services/automation').querySelector('[data-workflow-demo]'));
  assert.ok(docs.get('/services/websites').querySelector('#web .web-tiers'));
  const network = docs.get('/services/networks-cabling').querySelector('main').textContent;
  assert.match(network, /quoted after an on-site assessment/);
  assert.match(network, /approve the quote before installation/i);
  assert.doesNotMatch(network, /\$[0-9]|Website Starter|The Front Door/);
  const pc = docs.get('/services/custom-pcs');
  assert.equal(pc.querySelector('#hero-demo').dataset.defaultTrack, 'gaming');
  const scripts = [...pc.querySelectorAll('script[src]')].map(el => el.getAttribute('src'));
  assert.ok(scripts.findIndex(src => src.startsWith('/pricing.js')) < scripts.findIndex(src => src.startsWith('/script.js')));
  const titles = new Set();
  const interests = [...home.querySelectorAll('#interest option')].map(el => el.value);
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
  for (const [path, doc] of docs) {
    assert.equal(doc.querySelector('.nav a').getAttribute('href'), '/services/ai-phone-agents', 'phone agents lead navigation: ' + path);
    assert.equal(doc.querySelectorAll('.nav > a').length, 6, 'desktop navigation: ' + path);
    assert.equal(doc.querySelector('.header-actions .header-call').getAttribute('href'), 'tel:+12546934919', 'working call invitation: ' + path);
    assert.ok(doc.querySelector('.mobile-menu a[href="/services/ai-phone-agents"]'), 'mobile phone navigation: ' + path);
    assert.ok(doc.querySelector('.footer-nav a[href="/services/ai-phone-agents#packages"]'), 'footer package navigation: ' + path);
    assert.ok(doc.querySelector('.mobile-menu a[href="/pc-builder"]'), 'mobile PC Builder navigation: ' + path);
    assert.ok(doc.querySelector('.footer-nav a[href="/pc-builder"]'), 'footer PC Builder navigation: ' + path);
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
  assert.equal(titles.size, 6);
});

test('phone packages preserve per-agent pricing, integration limits, and human decisions on both pages', async () => {
  const expected = [
    { name: 'Answering', monthly: '$349', setup: '$750', minutes: '300', additional: '$0.75' },
    { name: 'Receptionist', monthly: '$549', setup: '$1,250', minutes: '500', additional: '$0.75' },
    { name: 'Manager', monthly: '$749', setup: '$1,750', minutes: '700', additional: '$0.95' }
  ];
  const text = element => element.textContent.replace(/\s+/g, ' ').trim();
  for (const path of ['/', '/services/ai-phone-agents']) {
    const dom = new JSDOM(await (await fetch(origin + path)).text());
    const doc = dom.window.document, isHome = path === '/';
    const cards = [...doc.querySelectorAll(isHome ? '.phone-package-card' : '.ph-package')];
    assert.equal(cards.length, 3, path);
    for (const [index, price] of expected.entries()) {
      const card = cards[index];
      assert.equal(text(card.querySelector('h3')), price.name);
      assert.equal(text(card.querySelector(isHome ? '.phone-package-price strong' : '.ph-price strong')), price.monthly);
      assert.equal(text(card.querySelector(isHome ? '.phone-package-price span' : '.ph-price span')), '/month per agent');
      if (isHome) {
        assert.equal(text(card.querySelector('.phone-package-setup')), price.setup + ' setup · ' + price.minutes + ' included minutes');
        assert.equal(text(card.querySelector('.phone-overage')), price.additional + ' per additional minute');
      } else {
        assert.equal(text(card.querySelector('.ph-setup')), price.setup + ' setup');
        assert.deepEqual([...card.querySelectorAll('.ph-allowance dd')].map(text), [price.minutes, price.additional + '/min']);
      }
    }
    assert.match(text(cards[1]), /One standard calendar OR CRM integration/);
    assert.match(text(cards[2]), /[Tt]wo standard integrations total/);
    const main = text(doc.querySelector('main'));
    assert.match(main, /Financial decisions and policy exceptions (?:stay|remain) with (?:your |the )?business owner(?:\/team| or team)/);
    assert.match(main, /Each additional agent has its own setup fee, subscription, and minute allowance/);
    assert.match(main, /Included minutes cover AI-handled call time/);
    assert.match(main, /Custom integrations, texting, and additional transfer charges are quoted separately/);
    assert.match(main, /[Oo]ne business location and one language/);
    assert.match(main, /[Uu]p to 30 minutes of routine configuration updates each month/);
    assert.match(main, /USD per agent, before applicable taxes/);
    assert.match(main, /compatible call forwarding/);
    assert.match(main, /Jaylene.*AI receptionist/);
    assert.match(main, /Hideo.*AI manager/);
    assert.match(main, isHome ? /not a two-agent bundle/ : /does not automatically include two agents/);
    for (const link of doc.querySelectorAll('a[href^="tel:"]')) assert.equal(link.getAttribute('href'), 'tel:+12546934919');
    dom.window.close();
  }
});
test('database outage returns a recoverable error, never a false success', async () => {
  const response = await fetch(origin + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Example', email: 'example@example.test', interest: 'AI phone agents' }) });
  assert.equal(response.status, 503); const body = await response.json(); assert.ok(body.error); assert.notEqual(body.ok, true);
});
test('private inbox stays inaccessible without separate credentials', async () => {
  delete process.env.LEADS_DASHBOARD_PASSWORD; assert.equal((await fetch(origin + '/leads')).status, 404);
  process.env.LEADS_DASHBOARD_PASSWORD = 'a-long-test-only-password';
  const response = await fetch(origin + '/leads'); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
  const invalid = await fetch(origin + '/leads', { headers: { Authorization: 'Basic ' + Buffer.from('mike:incorrect').toString('base64') } }); assert.equal(invalid.status, 401);
  delete process.env.LEADS_DASHBOARD_PASSWORD;
});
