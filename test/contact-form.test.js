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
