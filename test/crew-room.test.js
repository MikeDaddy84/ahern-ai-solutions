const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {createClient}=require('@libsql/client');
const {JSDOM}=require('jsdom');
const auth=require('../lib/portal-auth');
const portal=require('../lib/portal');
let directory,store,server,origin,owner,second,client,csrf;
const password='crew-room-test-password-only';
async function request(route,{cookie,body,method=body?'POST':'GET',token,source=origin}={}) {
  return fetch(origin+route,{redirect:'manual',method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:source}:{}),...(token?{'X-CSRF-Token':token}:{})},body:body?JSON.stringify(body):undefined});
}
async function login(email) {
  const r=await request('/api/portal/login',{body:{email,password}});assert.equal(r.status,200);
  return r.headers.get('set-cookie').split(';')[0];
}
test.before(async()=>{
  process.env.NODE_ENV='test';
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'crew-room-'));
  store=auth.createStore(createClient({url:'file:'+path.join(directory,'portal.db')}));
  await store.provision({email:'owner@example.test',name:'Mike',password,workspace:'crew',role:'owner'});
  await store.provision({email:'second@example.test',name:'Other Owner',password,workspace:'other',role:'owner'});
  await store.provision({email:'client@example.test',name:'Customer',password,workspace:'customer',role:'client'});
  const app=express();app.use(express.json());app.use(portal.createRouter({storeProvider:()=>store}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
  owner=await login('owner@example.test');second=await login('second@example.test');client=await login('client@example.test');
  csrf=(await (await request('/api/portal/me',{cookie:owner})).json()).csrf;
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));store.client.close();fs.rmSync(directory,{recursive:true,force:true});});
test('only owners see the link and can reach the room; anonymous access requires login',async()=>{
  const anonymous=await request('/portal/crew-room');assert.equal(anonymous.status,303);assert.equal(anonymous.headers.get('location'),'/login');
  assert.equal((await request('/api/portal/crew-room/messages')).status,401);
  assert.equal((await request('/portal/crew-room',{cookie:client})).status,403);
  assert.equal((await request('/api/portal/crew-room/messages',{cookie:client})).status,403);
  const ownHTML=await (await request('/portal',{cookie:owner})).text();
  const doc=new JSDOM(ownHTML).window.document;
  const labels=[...doc.querySelectorAll('nav[aria-label="Workspace"] a')].map(a=>a.textContent);
  assert.ok(labels.some(x=>x.includes('Satori')) && labels.some(x=>x.includes('Hosaka')) && labels.some(x=>x.includes('Crew Room')));
  assert.ok(doc.querySelector('a[href="/portal/crew-room"]'));
  assert.doesNotMatch(await (await request('/portal',{cookie:client})).text(),/href="\/portal\/crew-room"/);
  assert.doesNotMatch(await (await request('/portal/preview')).text(),/href="\/portal\/crew-room"/);
  const room=await request('/portal/crew-room',{cookie:owner});assert.equal(room.status,200);
  assert.match(room.headers.get('cache-control'),/no-store/);
  const html=await room.text();assert.match(html,/crew-room-csrf/);assert.doesNotMatch(html,/PORTAL_SESSION|Sample:/);
});
test('writes enforce session CSRF, sender provenance and idempotency',async()=>{
  const body={recipient:'jaylene',thread:'triage',text:'A real request with <script> text',request_key:'test-one'};
  assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,body})).status,403);
  assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,source:'https://evil.example',body})).status,403);
  assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body:{...body,sender:'tank'}})).status,400);
  const posted=await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body});assert.equal(posted.status,201);
  const first=await posted.json();assert.equal(first.kind,'human');assert.equal(first.sender,'Mike (owner)');
  const retry=await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body});assert.equal((await retry.json()).seq,first.seq);
  assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body:{...body,text:'changed'}})).status,409);
  for(const invalid of [{...body,request_key:'bad-recipient',recipient:'maelcom'},{...body,request_key:'huge',text:'x'.repeat(16001)}])assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body:invalid})).status,400);
});
test('a second browser sees persisted messages while another workspace cannot',async()=>{
  const newBrowser=await login('owner@example.test');
  const current=await (await request('/api/portal/crew-room/messages',{cookie:newBrowser})).json();assert.equal(current.messages.length,1);
  assert.equal(current.messages[0].text,'A real request with <script> text');
  const other=await (await request('/api/portal/crew-room/messages',{cookie:second})).json();assert.deepEqual(other.messages,[]);
  const searched=await (await request('/api/portal/crew-room/messages?q=script',{cookie:owner})).json();assert.equal(searched.messages.length,1);
  const delta=await (await request('/api/portal/crew-room/messages?after='+current.messages[0].seq,{cookie:owner})).json();assert.deepEqual(delta.messages,[]);
  assert.equal((await request('/api/portal/crew-room/messages?after=1&before=2',{cookie:owner})).status,400);
  assert.equal((await request('/api/portal/crew-room/messages?workspace=other',{cookie:owner})).status,400);
});
test('new and older pages are ordered, bounded and gap-free within this workspace',async()=>{
  for(let n=0;n<5;n++)assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,body:{recipient:'room',thread:'pagination',text:'Pagination '+n,request_key:'page-'+n}})).status,201);
  const latest=await (await request('/api/portal/crew-room/messages?limit=3',{cookie:owner})).json();
  const before=await (await request('/api/portal/crew-room/messages?limit=3&before='+latest.messages[0].seq,{cookie:owner})).json();
  const combined=[...before.messages,...latest.messages];assert.equal(combined.length,6);assert.equal(new Set(combined.map(m=>m.seq)).size,6);
  assert.deepEqual(combined.map(m=>m.seq),combined.map(m=>m.seq).sort((a,b)=>a-b));
  assert.equal((await request('/api/portal/crew-room/messages?limit=101',{cookie:owner})).status,400);
  for(const method of ['DELETE','PATCH'])assert.equal((await request('/api/portal/crew-room/messages',{cookie:owner,token:csrf,method,body:{}})).status,404);
  assert.equal((await request('/api/portal/crew-room/execute',{cookie:owner,token:csrf,body:{}})).status,404);
});
