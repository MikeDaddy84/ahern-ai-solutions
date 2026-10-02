const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('failed form submissions preserve the fields and retry identity until durable success', async () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window; w.matchMedia = () => ({ matches: true });
  const requests = []; let persisted = false;
  w.fetch = async (url, options) => {
    if (url !== '/api/contact') return { ok: true, json: async () => ({}) };
    requests.push(JSON.parse(options.body));
    return { ok: persisted, json: async () => persisted ? { ok: true, persisted: true } : { error: 'Please retry' } };
  };
  w.eval(fs.readFileSync('public/pricing.js', 'utf8')); w.eval(fs.readFileSync('public/script.js', 'utf8'));
  const form = w.document.querySelector('#audit-form');
  form.elements.namedItem('name').value = 'Example Visitor'; form.elements.namedItem('email').value = 'example@example.test'; form.elements.namedItem('interest').value = 'AI automation';
  async function submit() { form.dispatchEvent(new w.Event('submit', { cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); }
  await submit();
  assert.equal(form.elements.namedItem('name').value, 'Example Visitor'); assert.notEqual(form.style.display, 'none');
  assert.equal(w.document.querySelector('#form-result').textContent, 'Please retry');
  persisted = true; await submit(); assert.equal(requests.length, 2); assert.equal(requests[0].requestId, requests[1].requestId);
  assert.equal(form.style.display, 'none'); assert.equal(w.document.querySelector('#audit-success').hidden, false); dom.window.close();
});

test('automation demo switches scenarios without sending a network request', async () => {
  const { demoHtml } = require('../lib/services');
  const dom = new JSDOM(demoHtml(), { runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: true }); dom.window.fetch = () => { throw new Error('No network expected'); };
  dom.window.eval(fs.readFileSync('public/workflow-demo.js', 'utf8'));
  dom.window.document.querySelector('[data-scenario="entry"]').click(); dom.window.document.querySelector('#workflow-run').click();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelectorAll('.is-complete').length, 3);
  assert.match(dom.window.document.querySelector('#workflow-status').textContent, /Example complete/); dom.window.close();
});

test('phone-agent inquiry prefill, recovery, and analytics require durable success', async () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: 'https://example.test/?interest=AI%20phone%20agents#audit', runScripts: 'outside-only' });
  const w = dom.window; w.matchMedia = () => ({ matches: true });
  const requests = [], events = [];
  // All network work is mocked. No inquiry or event leaves this test.
  w.fetch = async (url, options) => {
    if (url === '/api/events') events.push(JSON.parse(options.body));
    if (url !== '/api/contact') return { ok: true, json: async () => ({}) };
    requests.push(JSON.parse(options.body));
    if (requests.length === 2) throw new Error('Simulated offline request');
    return { ok: true, json: async () => ({ ok: true, persisted: requests.length === 3 }) };
  };
  w.eval(fs.readFileSync('public/script.js', 'utf8'));
  const form = w.document.querySelector('#audit-form');
  assert.equal(form.elements.namedItem('interest').value, 'AI phone agents');
  assert.match(w.document.querySelector('#project-details-label').textContent, /Call handling needs/);
  form.elements.namedItem('name').value = 'Example Visitor';
  form.elements.namedItem('email').value = 'example@example.test';
  form.elements.namedItem('projectDetails').value = 'Receptionist; one booking calendar';
  async function submit() { form.dispatchEvent(new w.Event('submit', { cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); }
  await submit();
  assert.notEqual(form.style.display, 'none', 'HTTP success alone must not claim persistence');
  assert.equal(w.document.querySelector('#audit-success').hidden, true);
  assert.equal(events.length, 0);
  await submit();
  assert.notEqual(form.style.display, 'none');
  assert.match(w.document.querySelector('#form-result').textContent, /Network error/);
  assert.equal(form.elements.namedItem('projectDetails').value, 'Receptionist; one booking calendar');
  assert.equal(form.querySelector('button[type="submit"]').disabled, false);
  await submit();
  assert.equal(requests.length, 3);
  assert.equal(new Set(requests.map(request => request.requestId)).size, 1);
  assert.equal(form.style.display, 'none');
  assert.equal(w.document.querySelector('#audit-success').hidden, false);
  const { lead } = require('../lib/contact').validate(requests[2]);
  assert.equal(lead.interest, 'AI phone agents');
  assert.match(lead.message, /Project details: Receptionist; one booking calendar/);
  assert.deepEqual(events, [{ event: 'inquiry_received', service: 'ai-phone-agents' }]);
  assert.equal(require('../lib/db').validEvent(events[0]), true);
  w.close();
});

test('phone-agent service and inquiry links send only allowlisted anonymous events', () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window; w.matchMedia = () => ({ matches: true });
  const events = [];
  w.fetch = async (url, options) => {
    if (url === '/api/events') events.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({}) };
  };
  w.eval(fs.readFileSync('public/script.js', 'utf8'));
  // Run the real document click handler, then suppress JSDOM navigation.
  w.document.addEventListener('click', event => event.preventDefault());
  w.document.querySelector('a[href="/services/ai-phone-agents"]').click();
  w.document.querySelector('a[href="/services/ai-phone-agents"]').click();
  const inquiry = w.document.createElement('a');
  inquiry.href = '/?interest=AI%20phone%20agents#audit'; w.document.body.appendChild(inquiry); inquiry.click();
  assert.deepEqual(events, [{ event: 'service_selected', service: 'ai-phone-agents' }, { event: 'quote_requested', service: 'ai-phone-agents' }]);
  for (const event of events) assert.equal(require('../lib/db').validEvent(event), true);
  w.close();
});


test('network assessment links prefill an accepted inquiry with site-specific context', async () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: 'https://example.test/?interest=Networks%20%26%20cabling#audit', runScripts: 'outside-only' });
  const w = dom.window; w.matchMedia = () => ({ matches: true });
  const requests = [];
  w.fetch = async (url, options) => {
    if (url === '/api/contact') requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, persisted: true }) };
  };
  w.eval(fs.readFileSync('public/script.js', 'utf8'));
  const form = w.document.querySelector('#audit-form');
  assert.equal(form.elements.namedItem('interest').value, 'Networks & cabling');
  assert.match(w.document.querySelector('#project-details-label').textContent, /Site location/);
  form.elements.namedItem('name').value = 'Example Visitor';
  form.elements.namedItem('email').value = 'example@example.test';
  form.elements.namedItem('projectDetails').value = 'Gordon office; switch and Ethernet assessment';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 1);
  const { lead } = require('../lib/contact').validate(requests[0]);
  assert.equal(lead.interest, 'Networks & cabling');
  assert.match(lead.message, /switch and Ethernet assessment/);
  assert.equal(require('../lib/db').validEvent({ event: 'quote_requested', service: 'networks-cabling' }), true);
  dom.window.close();
});
