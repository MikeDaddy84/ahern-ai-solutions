// Call Desk v1.1.0 — access, CSRF, roles, idempotency, do-not-call and due dates.
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
const desk=require('../lib/call-desk');
let directory,store,server,origin,owner,sales,client,ownerCsrf,salesCsrf;
const password='call-desk-test-password-only';
const API='/api/portal/call-desk';
async function request(route,{cookie,body,method=body?'POST':'GET',token,source=origin}={}) {
  return fetch(origin+route,{redirect:'manual',method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:source}:{}),...(token?{'X-CSRF-Token':token}:{})},body:body?JSON.stringify(body):undefined});
}
async function login(email) {
  const r=await request('/api/portal/login',{body:{email,password}});assert.equal(r.status,200);
  return r.headers.get('set-cookie').split(';')[0];
}
const csrfFor=async cookie=>(await (await request('/api/portal/me',{cookie})).json()).csrf;
test.before(async()=>{
  process.env.NODE_ENV='test';
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'call-desk-'));
  store=auth.createStore(createClient({url:'file:'+path.join(directory,'portal.db')}));
  await store.provision({email:'owner@example.test',name:'Mike',password,workspace:'owner',role:'owner'});
  await store.provision({email:'sales@example.test',name:'Scotty',password,workspace:'sales',role:'employee'});
  await store.provision({email:'client@example.test',name:'Customer',password,workspace:'customer',role:'client'});
  const app=express();app.use(express.json());app.use(portal.createRouter({storeProvider:()=>store}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
  owner=await login('owner@example.test');sales=await login('sales@example.test');client=await login('client@example.test');
  ownerCsrf=await csrfFor(owner);salesCsrf=await csrfFor(sales);
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));store.client.close();fs.rmSync(directory,{recursive:true,force:true});});

test('anonymous visitors are sent to sign-in with a desk-only return path; clients are refused',async()=>{
  const anon=await request('/portal/call-desk');assert.equal(anon.status,303);assert.equal(anon.headers.get('location'),'/login?next=%2Fportal%2Fcall-desk');
  // Other private pages keep the plain redirect.
  assert.equal((await request('/portal/settings')).headers.get('location'),'/login');
  assert.equal((await request(API+'/state')).status,401);
  assert.equal((await request('/portal/call-desk',{cookie:client})).status,403);
  assert.equal((await request(API+'/state',{cookie:client})).status,403);
  const clientNav=new JSDOM(await (await request('/portal',{cookie:client})).text()).window.document;
  assert.equal(clientNav.querySelector('a[href="/portal/call-desk"]'),null);
});
test('owner and employee get the desk page with session meta, nav link and no inline script',async()=>{
  for(const cookie of [owner,sales]) {
    const nav=new JSDOM(await (await request('/portal',{cookie})).text()).window.document;
    assert.ok(nav.querySelector('nav[aria-label="Workspace"] a[href="/portal/call-desk"]'));
    const res=await request('/portal/call-desk',{cookie});assert.equal(res.status,200);
    assert.match(res.headers.get('cache-control'),/no-store/);
    assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await res.text();assert.doesNotMatch(html,/PORTAL_SESSION/);
    const doc=new JSDOM(html).window.document;
    assert.ok(doc.querySelector('meta[name="call-desk-csrf"]').content.length>10);
    assert.ok(doc.querySelector('script[src^="/call-desk/app.js"]'));
    assert.equal([...doc.querySelectorAll('script')].filter(s=>!s.src).length,0,'portal CSP forbids inline scripts');
    assert.doesNotMatch(html,/fonts\.googleapis/);
  }
  const roleMeta=new JSDOM(await (await request('/portal/call-desk',{cookie:sales})).text()).window.document.querySelector('meta[name="call-desk-role"]').content;
  assert.equal(roleMeta,'employee');
});
test('writes require CSRF and same origin, validate input, and replay safely',async()=>{
  const call={request_key:'call-key-0001',business:'Brazos Plumbing',phone:'(940) 555-0101',seen:'none',contact:'Dale',outcome:'callback',notes:'Try Thursday <b>am</b>'};
  assert.equal((await request(API+'/calls',{cookie:sales,body:call})).status,403);
  assert.equal((await request(API+'/calls',{cookie:sales,token:salesCsrf,source:'https://evil.example',body:call})).status,403);
  assert.equal((await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{...call,request_key:'bad'}})).status,400);
  assert.equal((await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{...call,request_key:'call-key-0002',outcome:'sold'}})).status,400);
  assert.equal((await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:'call-key-0003',outcome:'callback'}})).status,400);
  assert.equal((await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{...call,request_key:'call-key-0004',outcome:'booked'}})).status,400,'booked needs a time and email');
  const first=await request(API+'/calls',{cookie:sales,token:salesCsrf,body:call});assert.equal(first.status,201);
  const again=await request(API+'/calls',{cookie:sales,token:salesCsrf,body:call});assert.equal(again.status,201);
  const a=await first.json(),b=await again.json();assert.equal(a.id,b.id);assert.equal(b.replay,true);
  const state=await (await request(API+'/state',{cookie:owner})).json();
  const saved=state.calls.filter(c=>c.business==='Brazos Plumbing');
  assert.equal(saved.length,1);assert.equal(saved[0].phone_norm,'9405550101');assert.equal(saved[0].by_name,'Scotty');
  assert.equal(saved[0].notes,'Try Thursday <b>am</b>','stored as text; the client renders with textContent');
});
test('find-outs: employee asks, only the owner answers, then the employee relays',async()=>{
  const q={request_key:'q-key-00001',text:'Can the contact form text my phone?',reach:'email',reach_to:'dale@example.test',business:'Brazos Plumbing',contact:'Dale'};
  const made=await request(API+'/questions',{cookie:sales,token:salesCsrf,body:q});assert.equal(made.status,201);
  const {id,due_by}=await made.json();assert.ok(due_by>Date.now());
  assert.equal((await (await request(API+'/questions',{cookie:sales,token:salesCsrf,body:q})).json()).id,id,'retry returns the same question');
  assert.equal((await request(API+`/questions/${id}/relay`,{cookie:sales,token:salesCsrf,body:{}})).status,409,'cannot relay before an answer');
  assert.equal((await request(API+`/questions/${id}/answer`,{cookie:sales,token:salesCsrf,body:{answer:'Sure'}})).status,403);
  assert.equal((await request(API+`/questions/${id}/answer`,{cookie:owner,token:ownerCsrf,body:{answer:''}})).status,400);
  assert.equal((await request(API+`/questions/${id}/answer`,{cookie:owner,token:ownerCsrf,body:{answer:'Yes, as an add-on automation. Mike will scope it on the consult.'}})).status,200);
  assert.equal((await request(API+`/questions/${id}/relay`,{cookie:sales,token:salesCsrf,body:{}})).status,200);
  const row=(await (await request(API+'/state',{cookie:sales})).json()).questions.find(x=>x.id===id);
  assert.equal(row.status,'relayed');assert.match(row.answer,/add-on automation/);assert.equal(row.by_name,'Scotty');
  // Linking a question to the call it came from.
  const call=await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:'call-key-0010',business:'Mineral Wells HVAC',outcome:'sendinfo',question_ids:[id]}});
  assert.equal(call.status,201);
  const link=await store.client.execute({sql:'SELECT call_id FROM calldesk_questions WHERE id=?',args:[id]});
  assert.equal(link.rows[0].call_id,(await call.json()).id);
});
test('only the owner confirms consults and edits settings; do-not-call survives in state',async()=>{
  const booked=await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:'call-key-0020',business:'Gordon Feed',email:'owner@gordonfeed.example',outcome:'booked',consult_at:'2026-10-29T10:00',consult_label:'Thursday, Oct 29, 10:00 AM'}});
  const {id}=await booked.json();
  assert.equal((await request(API+`/calls/${id}/confirm`,{cookie:sales,token:salesCsrf,body:{}})).status,403);
  assert.equal((await request(API+`/calls/${id}/confirm`,{cookie:owner,token:ownerCsrf,body:{}})).status,200);
  const cfg={availability:'Tue–Thu 9–11am CT',length:20,callback_phone:'(254) 555-0199'};
  assert.equal((await request(API+'/config',{cookie:sales,token:salesCsrf,method:'PUT',body:cfg})).status,403);
  assert.equal((await request(API+'/config',{cookie:owner,token:ownerCsrf,method:'PUT',body:{...cfg,length:5}})).status,400);
  assert.equal((await request(API+'/config',{cookie:owner,token:ownerCsrf,method:'PUT',body:cfg})).status,200);
  await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:'call-key-0030',business:'Strawn Diner',phone:'254-555-0123',outcome:'dnc'}});
  const s=await (await request(API+'/state',{cookie:sales})).json();
  assert.equal(s.config.availability,cfg.availability);assert.equal(s.config.length,20);assert.equal(s.config.callback_phone,cfg.callback_phone);
  assert.ok(s.dnc.some(d=>d.phone_norm==='2545550123' && d.business==='Strawn Diner'));
  assert.equal(s.calls.find(c=>c.id===id).confirmed,true);
  assert.equal((await request(API+'/nope',{cookie:owner})).status,404);
});
test('find-out due dates land on the next business day at 5pm Central',()=>{
  const fmt=ms=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',hourCycle:'h23'}).format(new Date(ms));
  // Friday Oct 30 2026, 3pm CDT → Monday Nov 2 (CST after the Nov 1 change) at 17:00.
  assert.equal(fmt(desk.nextBusinessDay(Date.UTC(2026,9,30,20))),'Mon, 17');
  assert.equal(new Date(desk.nextBusinessDay(Date.UTC(2026,9,30,20))).toISOString(),'2026-11-02T23:00:00.000Z');
  // Tuesday 11pm Central is already Wednesday UTC; due is still Wednesday 5pm Central.
  assert.equal(new Date(desk.nextBusinessDay(Date.UTC(2026,9,28,4))).toISOString(),'2026-10-28T22:00:00.000Z');
});
test('employees see only their tools in the portal nav; Hosaka, Relay, Site visits and Crew Room stay owner-only',async()=>{
  const labels=async cookie=>[...new JSDOM(await (await request('/portal',{cookie})).text()).window.document.querySelectorAll('nav[aria-label="Workspace"] a')].map(a=>a.textContent.trim());
  const emp=(await labels(sales)).join('|');
  assert.match(emp,/Satori/);assert.match(emp,/Call Desk/);
  for(const hidden of ['Hosaka','Relay','Site visits','Crew Room']) assert.doesNotMatch(emp,new RegExp(hidden));
  const own=(await labels(owner)).join('|');
  for(const shown of ['Hosaka','Relay','Site visits','Crew Room','Call Desk']) assert.match(own,new RegExp(shown));
  assert.doesNotMatch((await labels(client)).join('|'),/Hosaka|Call Desk/);
  const overview=new JSDOM(await (await request('/portal',{cookie:sales})).text()).window.document;
  assert.ok(overview.querySelector('main a.settings-shortcut[href="/portal/call-desk"]'),'employee overview links to the desk');
  for(const route of ['/portal/visits','/portal/crew-room']) assert.equal((await request(route,{cookie:sales})).status,403,route);
});
