const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { demoHtml } = require('../lib/services');

function setup(t) {
  const dom = new JSDOM(demoHtml(), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, pending = new Map();
  let sequence = 0;
  w.matchMedia = () => ({ matches: false });
  w.fetch = () => { throw new Error('Demo must not send data'); };
  w.setTimeout = fn => { pending.set(++sequence, fn); return sequence; };
  w.clearTimeout = id => pending.delete(id);
  w.eval(fs.readFileSync('public/workflow-demo.js', 'utf8'));
  const query = selector => w.document.querySelector(selector);
  return { w, pending, query, click: selector => query(selector).click(), count: () => w.document.querySelectorAll('.workflow-record').length };
}

test('all scenarios carry sample details to a concrete result and replay cleanly', t => {
  const { click, count, query } = setup(t);
  for (const [key, record, result] of [
    ['leads', 'taylor@example.com', 'Awaiting your approval'],
    ['inbox', 'invoice 1042', 'Awaiting identity check and approval'],
    ['entry', 'INV-2087', 'Needs review · not posted to accounts']
  ]) {
    click('[data-scenario="' + key + '"]');
    assert.equal(count(), 0);
    assert.equal(query('#workflow-result').hidden, true);
    for (let i = 1; i <= 3; i++) { click('#workflow-next'); assert.equal(count(), i); }
    assert.match(query('#workflow-steps').textContent, new RegExp(record));
    assert.ok(query('#workflow-steps').textContent.includes(result));
    assert.equal(query('#workflow-result').hidden, false);
    assert.equal(query('#workflow-next').disabled, true);
    assert.equal(query('#workflow-progress-bar').style.width, '100%');
    click('#workflow-run');
    assert.equal(count(), 1);
    assert.equal(query('#workflow-result').hidden, true);
  }
});

test('pausing, stepping, switching scenarios, and leaving the page cancel pending playback', t => {
  const { w, click, pending, count, query } = setup(t);
  click('#workflow-run');
  assert.equal(count(), 1);
  const stale = [...pending.values()][0];
  click('#workflow-run');
  assert.equal(pending.size, 0);
  stale();
  assert.equal(count(), 1);
  click('#workflow-next');
  assert.equal(count(), 2);
  assert.equal(pending.size, 0);
  click('#workflow-run');
  assert.equal(count(), 3);
  click('#workflow-run');
  const oldScenario = [...pending.values()][0];
  click('[data-scenario="inbox"]');
  oldScenario();
  assert.equal(count(), 0);
  assert.equal(query('[data-scenario="inbox"]').getAttribute('aria-pressed'), 'true');
  click('#workflow-run');
  Object.defineProperty(w.document, 'hidden', { configurable: true, value: true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(pending.size, 0);
  assert.equal(query('#workflow-run').textContent, 'Continue example →');
});
