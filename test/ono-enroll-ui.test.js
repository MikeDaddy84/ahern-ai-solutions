const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {addAccount} = require('../lib/ono-mail-workspace');

test('Add Account seals the password for the paired device and opens the published account', async t => {
  const dom = new JSDOM('<main id="main" data-csrf="fixture">'+addAccount(true)+'</main>',
    {url:'https://portal.example.test',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w = dom.window, doc = w.document;
  Object.defineProperty(w,'crypto',{value:webcrypto});
  w.TextEncoder = TextEncoder;
  const keys = await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64');
  const address = 'owner@example.test', password = 'fixture-pass', id = 'mail-example';
  const calls = [];
  w.fetch = async (url,opts)=>{
    if (url.endsWith('/overview/ono-sendai')) return {ok:true,json:async()=>({accounts:[{id}]})};
    const body=JSON.parse(opts.body);
    calls.push(body);
    return {ok:true,json:async()=>body.action==='setupKey'?{publicKey}:{id}};
  };
  w.eval(fs.readFileSync(require.resolve('../public/ono-enroll.js'),'utf8'));
  doc.querySelector('#enroll-address').value = address;
  doc.querySelector('#enroll-password').value = password;
  const provider = doc.querySelector('select');
  provider.value = 'yahoo';
  provider.dispatchEvent(new w.Event('change'));
  assert.match(doc.querySelector('#provider-help').href,/yahoo\.com/);
  const link = doc.querySelector('#enroll-open');
  const ready = new Promise(resolve=>{
    const observer = new w.MutationObserver(()=>{if (!link.hidden) { observer.disconnect(); resolve(); }});
    observer.observe(link,{attributes:true});
  });
  doc.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await ready;
  assert.equal(link.pathname,'/portal/ono-sendai/account/'+id);
  assert.equal(calls.length,2);
  assert.ok(!JSON.stringify(calls).includes(password));
  const plaintext = await webcrypto.subtle.decrypt({name:'RSA-OAEP',label:Buffer.from('yahoo:'+address)},
    keys.privateKey,Buffer.from(calls[1].sealed,'base64'));
  assert.equal(Buffer.from(plaintext).toString(),password);
});
