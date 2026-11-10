const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const portal = require('../lib/portal');

const script = fs.readFileSync(path.join(__dirname, '../public/overview.js'), 'utf8');
const updatedAt = '2026-11-10T15:00:00Z';
const priority = text => ({ status: 'ready', updatedAt, dayKey: '2026-11-10', counts: { total: 3, done: 2, remaining: 1 }, tasks: [{ id: 'task-1', status: 'today', text }] });
const visits = {
  status: 'ready', updatedAt, today: '2026-11-10', timeZone: 'UTC', metric: 'pageViews',
  counts: { today: 29, week: 182, month: 435, total: 1000 },
  days: Array.from({ length: 30 }, (_, index) => ({ day: new Date(Date.UTC(2026, 9, 12 + index)).toISOString().slice(0, 10), views: index })),
};
const calls = {
  status: 'ready', updatedAt,
  counts: { actionable: 3, openQuestions: 1, overdueQuestions: 1, answeredQuestions: 1, unconfirmedConsults: 1 },
  openQuestions: [{ id: 'question', business: 'Example <b>Business</b>', text: 'Needs a factual answer', dueBy: Date.parse(updatedAt) - 3600000, overdue: true }],
  answeredQuestions: [{ id: 'answer', business: 'Second business', text: 'Ready to pass on', answer: 'The answer' }],
  unconfirmedConsults: [{ id: 'consult', business: 'Third business', consultAt: '2026-11-11T10:00', consultLabel: 'Wednesday 10 AM' }],
};
const relay = summary => ({ status: 'ready', updatedAt, periodDays: 7, counts: { replies: 1 }, replies: [{ business: 'Reply <b>business</b>', summary, at: updatedAt }], lastSyncAt: updatedAt, syncError: false });
const crew = { status: 'ready', updatedAt, periodDays: 7, counts: { recentMessages: 1 }, messages: [{ author: 'A crew member', text: '<script>private()</script>', createdAt: updatedAt }] };
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const flush = () => new Promise(resolve => setImmediate(resolve));

function open({ role = 'owner', preview = false, fetch = async url => response(url.endsWith('/satori') ? priority('Current priority') : url.endsWith('/visits') ? visits : calls) } = {}) {
  const dom = new JSDOM(portal.shell({ name: '<img src=x onerror=alert(1)>', role, preview }), { url: 'https://ahernai.com/portal', runScripts: 'outside-only' });
  dom.window.fetch = fetch;
  dom.window.eval(script);
  return dom;
}
const card = (dom, id) => dom.window.document.querySelector(`[data-widget="${id}"]`);
function message(dom, widget, data, { origin, source } = {}) {
  const frame = card(dom, widget).querySelector('iframe');
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    origin: origin || (widget === 'relay' ? 'https://hosaka.ahernai.com' : 'https://crew.ahernai.com'),
    source: source === undefined ? frame.contentWindow : source,
    data: { type: 'ahernai:overview', widget, data },
  }));
}

test('Overview renders tools by role and preview never fetches private summaries or creates remote frames', async () => {
  for (const [role, expected] of [
    ['owner', ['visits', 'satori', 'call-desk', 'relay', 'crew-room']],
    ['employee', ['satori', 'call-desk']],
    ['member', ['satori']],
    ['client', ['satori']],
  ]) {
    const requests = [];
    const dom = open({ role, fetch: async url => { requests.push(url); return response(url.endsWith('/satori') ? priority('My priority') : url.endsWith('/visits') ? visits : calls); } });
    try {
      await flush();
      assert.deepEqual([...dom.window.document.querySelectorAll('[data-widget]')].map(node => node.dataset.widget), expected);
      assert.deepEqual(requests, expected.filter(id => !['relay', 'crew-room'].includes(id)).map(id => '/api/portal/overview/' + id));
      assert.equal(dom.window.document.querySelectorAll('iframe').length, role === 'owner' ? 2 : 0);
      assert.equal(dom.window.document.querySelector('main img'), null, 'account display name is escaped');
    } finally { dom.window.close(); }
  }
  let fetched = false;
  const preview = open({ role: 'owner', preview: true, fetch: async () => { fetched = true; throw new Error('Preview must not fetch'); } });
  try {
    preview.window.document.getElementById('overview-refresh').click();
    await flush();
    assert.equal(fetched, false);
    assert.deepEqual([...preview.window.document.querySelectorAll('[data-widget]')].map(node => node.dataset.widget), ['satori']);
    assert.equal(preview.window.document.querySelectorAll('iframe').length, 0);
    assert.equal(card(preview, 'satori').dataset.state, 'ready');
    assert.equal(card(preview, 'satori').querySelector('.overview-state').textContent, 'Preview');
    assert.match(card(preview, 'satori').textContent, /Sample data/);
  } finally { preview.window.close(); }
});

test('successful widgets render escaped text, exact chart values and separate actionable queues', async () => {
  const unsafe = '<img src=x onerror=alert(1)> & important';
  const dom = open({ fetch: async url => response(url.endsWith('/satori') ? priority(unsafe) : url.endsWith('/visits') ? visits : calls) });
  try {
    await flush();
    message(dom, 'relay', relay(unsafe));
    message(dom, 'crew-room', crew);
    for (const id of ['satori', 'visits', 'call-desk', 'relay', 'crew-room']) {
      assert.equal(card(dom, id).dataset.state, 'ready', id);
      assert.equal(card(dom, id).getAttribute('aria-busy'), 'false');
      assert.equal(card(dom, id).querySelector('.overview-retry').hidden, true);
      assert.equal(card(dom, id).querySelector('.overview-body img, .overview-body script, .overview-body b'), null, 'tool data remains text');
    }
    assert.equal(card(dom, 'satori').querySelector('.overview-list p').textContent, unsafe);
    assert.equal(card(dom, 'satori').querySelector('progress').value, 2);
    assert.equal(card(dom, 'satori').querySelector('progress').max, 3);
    assert.equal(card(dom, 'relay').querySelector('.overview-list p').textContent, unsafe);
    assert.equal(card(dom, 'visits').querySelector('.overview-metric strong').textContent, '435');
    const bars = card(dom, 'visits').querySelectorAll('.overview-chart > span');
    assert.equal(bars.length, 30);
    assert.equal(bars[0].title, '2026-10-12: 0 page views');
    assert.equal(bars[29].style.getPropertyValue('--view-height'), '100%');
    assert.equal(card(dom, 'visits').querySelectorAll('tbody tr').length, 30);
    assert.equal(card(dom, 'visits').querySelector('tbody tr td').textContent, '29');
    assert.match(card(dom, 'visits').textContent, /UTC dates.*repeat loads count again/);
    assert.equal(card(dom, 'call-desk').querySelector('.overview-metric strong').textContent, '3');
    assert.match(card(dom, 'call-desk').textContent, /Overdue find-out/);
    assert.match(card(dom, 'call-desk').textContent, /Answer ready to relay/);
    assert.match(card(dom, 'call-desk').textContent, /Confirm consult/);
  } finally { dom.window.close(); }
});

test('bridge accepts only its exact origin and current iframe source, including after refresh', async () => {
  const dom = open();
  try {
    await flush();
    const relayCard = card(dom, 'relay');
    const oldSource = relayCard.querySelector('iframe').contentWindow;
    const otherSource = card(dom, 'crew-room').querySelector('iframe').contentWindow;
    message(dom, 'relay', relay('Wrong origin'), { origin: 'https://evil.example', source: oldSource });
    message(dom, 'relay', relay('Other tool'), { source: otherSource });
    message(dom, 'relay', relay('No source'), { source: null });
    assert.equal(relayCard.dataset.state, undefined);
    assert.doesNotMatch(relayCard.textContent, /Wrong origin|Other tool|No source/);
    message(dom, 'relay', relay('Verified current source'), { source: oldSource });
    assert.equal(relayCard.dataset.state, 'ready');
    assert.match(relayCard.textContent, /Verified current source/);
    dom.window.document.getElementById('overview-refresh').click();
    const newSource = relayCard.querySelector('iframe').contentWindow;
    assert.notEqual(newSource, oldSource);
    message(dom, 'relay', relay('Stale frame'), { source: oldSource });
    assert.doesNotMatch(relayCard.textContent, /Stale frame/);
    message(dom, 'relay', relay('New frame accepted'), { source: newSource });
    assert.match(relayCard.textContent, /New frame accepted/);
    assert.equal(relayCard.getAttribute('aria-busy'), 'false');
    await flush(); // Let the refreshed local requests finish before closing the DOM.
  } finally { dom.window.close(); }
});

test('expired sessions and unavailable sources display recovery states without invented zero counts', async () => {
  for (const [status, expected] of [[401, 'Sign in'], [503, 'Unavailable']]) {
    const dom = open({ role: 'member', fetch: async () => response({ status: 'unavailable', message: 'Service temporarily unavailable.' }, status) });
    try {
      await flush();
      const satori = card(dom, 'satori');
      assert.equal(satori.dataset.state, 'unavailable');
      assert.equal(satori.querySelector('.overview-state').textContent, expected);
      assert.equal(satori.querySelector('.overview-metric'), null);
      assert.equal(satori.querySelector('.overview-retry').hidden, false);
      assert.equal(satori.getAttribute('aria-busy'), 'false');
      assert.doesNotMatch(satori.textContent, /No Have Tos|Have Tos are complete|0 remaining/);
    } finally { dom.window.close(); }
  }
  const dom = open();
  try {
    await flush();
    message(dom, 'relay', { status: 'unavailable' });
    assert.equal(card(dom, 'relay').dataset.state, 'unavailable');
    assert.equal(card(dom, 'relay').querySelector('.overview-metric'), null);
    assert.doesNotMatch(card(dom, 'relay').textContent, /No replies recorded/);
  } finally { dom.window.close(); }
});

test('non-JSON and network failures show a readable recovery message and can be retried', async () => {
  for (const failure of [new SyntaxError('Unexpected token < in <!DOCTYPE html>'), new TypeError('Failed to fetch')]) {
    let attempt = 0;
    const dom = open({ role: 'member', fetch: async () => {
      if (++attempt > 1) return response(priority('Recovered priority'));
      if (failure.name === 'TypeError') throw failure;
      return { status: 200, ok: true, json: async () => { throw failure; } };
    } });
    try {
      await flush();
      const satori = card(dom, 'satori');
      assert.equal(satori.dataset.state, 'unavailable');
      assert.match(satori.textContent, /Please try again/);
      assert.doesNotMatch(satori.textContent, /Unexpected token|DOCTYPE|Failed to fetch/);
      assert.equal(satori.querySelector('.overview-metric'), null);
      satori.querySelector('.overview-retry').click();
      await flush();
      assert.equal(satori.dataset.state, 'ready');
      assert.match(satori.textContent, /Recovered priority/);
    } finally { dom.window.close(); }
  }
});

test('refresh prevents delayed JSON from an older local request replacing the latest summary', async () => {
  let releaseOld;
  const oldBody = new Promise(resolve => { releaseOld = resolve; });
  let count = 0;
  const dom = open({ role: 'member', fetch: async () => ++count === 1
    ? { status: 200, ok: true, json: () => oldBody }
    : response(priority('Latest priority')) });
  try {
    await flush(); // First request has resolved its headers and is waiting for JSON.
    dom.window.document.getElementById('overview-refresh').click();
    await flush();
    assert.match(card(dom, 'satori').textContent, /Latest priority/);
    releaseOld(priority('Stale priority'));
    await flush();
    assert.match(card(dom, 'satori').textContent, /Latest priority/);
    assert.doesNotMatch(card(dom, 'satori').textContent, /Stale priority/);
  } finally { dom.window.close(); }
});

test('malformed successful summaries with null or missing counts stay unavailable rather than showing zero or NaN', async () => {
  for (const remaining of [null, undefined]) {
    const data = priority('A priority with an invalid count');
    if (remaining === undefined) delete data.counts.remaining;
    else data.counts.remaining = remaining;
    const dom = open({ role: 'member', fetch: async () => response(data) });
    try {
      await flush();
      const satori = card(dom, 'satori');
      assert.equal(satori.dataset.state, 'unavailable');
      assert.equal(satori.querySelector('.overview-metric'), null);
      assert.equal(satori.querySelector('.overview-retry').hidden, false);
      assert.match(satori.textContent, /incomplete summary/);
      assert.doesNotMatch(satori.textContent, /NaN|No Have Tos|Have Tos are complete|0 remaining/);
    } finally { dom.window.close(); }
  }
  const dom = open();
  try {
    await flush();
    message(dom, 'relay', { ...relay('Malformed bridge summary'), counts: { replies: null } });
    assert.equal(card(dom, 'relay').dataset.state, 'unavailable');
    assert.equal(card(dom, 'relay').querySelector('.overview-metric'), null);
    assert.doesNotMatch(card(dom, 'relay').textContent, /NaN|No replies recorded/);
  } finally { dom.window.close(); }
});
