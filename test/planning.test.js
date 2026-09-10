const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const planning = require('../public/planning');
const growth = require('../lib/growth');

function planner(service) {
  const dom = new JSDOM(growth.experience(service), { url: 'https://example.test/services/' + service });
  planning.mount(dom.window);
  // Prevent JSDOM navigation while still executing the real handoff handler.
  dom.window.document.addEventListener('click', e => e.preventDefault());
  return dom;
}

test('automation economics subtract review time and recurring costs and handle downside', () => {
  const result = planning.calculate([200, 8, 40, 60, 5, 1250, 50]);
  assert.equal(result.hours, 11); assert.equal(result.value, 390);
  assert.ok(Math.abs(result.recovery - 1250 / 390) < 0.00001);
  assert.equal(planning.calculate([200, 8, 40, 60, 5, 1250, 897]).recovery, null);
  assert.equal(planning.calculate([0, 8, 40, 60, 5, 1250, 50]).value, -250);
  for (const n of [-1, NaN, Infinity, 100001]) assert.equal(planning.calculate([n, 8, 40, 60, 5, 1250, 50]), null);
});

test('a plan carries only the selected service and current answers; repeated clicks retain one query parameter', () => {
  for (const service of ['automation', 'local-ai', 'websites']) {
    const dom = planner(service), w = dom.window, d = w.document;
    if (service === 'automation') d.querySelector('#monthly-cost').value = '897';
    const link = d.querySelector('[data-plan-handoff]'); link.click(); link.click();
    const stored = JSON.parse(w.sessionStorage.getItem('ahern-plan'));
    assert.equal(stored.service, service); assert.ok(stored.createdAt <= Date.now());
    assert.ok(stored.summary.length < 3000);
    const url = new URL(link.href); assert.deepEqual(url.searchParams.getAll('plan'), [service]);
    assert.equal(url.hash, '#audit');
    if (service === 'automation') assert.match(stored.summary, /No positive return/);
    dom.window.close();
  }
});

test('invalid estimates and blocked storage cannot silently carry a stale plan', () => {
  const dom = planner('automation'), w = dom.window, d = w.document;
  d.querySelector('#task-count').value = '';
  d.querySelector('[data-plan-handoff]').click();
  assert.equal(w.sessionStorage.getItem('ahern-plan'), null);
  assert.match(d.querySelector('[data-plan-title]').textContent, /Check your numbers/);
  d.querySelector('#task-count').value = '200';
  Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('blocked'); } });
  d.querySelector('[data-plan-handoff]').click();
  assert.match(d.querySelector('.plan-status').textContent, /could not carry/);
  w.close();
});

test('private AI fit flags scans, concurrent users, local boundaries and hardware reuse', () => {
  const result = planning.aiFit({task:'documents',documents:'scans',users:'team',boundary:'local',hardware:'existing'});
  for (const phrase of ['scan recognition', 'simultaneous use', 'external connection', 'existing computer']) assert.ok(result.text.includes(phrase));
});

test('document and website examples expose source limits and a complete human handoff', () => {
  const ai = planner('local-ai'), d = ai.window.document;
  d.querySelector('#document-question').value = 'unsupported'; d.querySelector('[data-document-run]').click();
  assert.match(d.querySelector('[data-answer]').textContent, /does not specify/);
  assert.match(d.querySelector('[data-citation]').textContent, /No supporting passage/);
  ai.window.close();
  const web = planner('websites'), wd = web.window.document;
  for (let i = 0; i < 4; i++) wd.querySelector('[data-intake-next]').click();
  assert.equal(wd.querySelectorAll('.intake-steps .is-active').length, 4);
  assert.match(wd.querySelector('[data-intake-status]').textContent, /no message was sent/);
  wd.querySelector('[data-intake-next]').click();
  assert.equal(wd.querySelectorAll('.intake-steps .is-active').length, 0);
  web.window.close();
});

function inquiry(plan, interest='AI automation', requested='automation') {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), {url:'https://example.test/?interest='+encodeURIComponent(interest)+'&plan='+requested,runScripts:'outside-only'});
  const w = dom.window; w.matchMedia = () => ({ matches: true }); w.fetch = async () => ({ok:true,json:async()=>({})});
  w.sessionStorage.setItem('ahern-plan', JSON.stringify(plan));
  w.eval(fs.readFileSync('public/script.js','utf8')); return dom;
}

test('inquiry planning notes remain editable and never attach to the wrong service or an expired visit', () => {
  const plan = {service:'automation',summary:'A workflow with 200 tasks',createdAt:Date.now()};
  const dom = inquiry(plan), d = dom.window.document;
  assert.equal(d.querySelector('[name=context]').value, plan.summary);
  assert.equal(d.querySelector('#plan-context-label').hidden, false);
  d.querySelector('[name=context]').value = 'My revised plan';
  assert.equal(d.querySelector('[name=context]').value, 'My revised plan');
  d.querySelector('#interest').value = 'Website or custom app';
  d.querySelector('#interest').dispatchEvent(new dom.window.Event('change'));
  assert.equal(d.querySelector('[name=context]').value, ''); dom.window.close();
  for (const invalid of [{...plan,createdAt:Date.now()-86400001},{...plan,createdAt:Date.now()+60000},{...plan,service:'websites'}]) {
    const stale = inquiry(invalid); assert.equal(stale.window.document.querySelector('[name=context]').value,''); stale.window.close();
  }
});
