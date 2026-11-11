// Call Desk tests — access, CSRF, roles, idempotency, do-not-call, due dates,
// owner edit/delete (1.2.0), and the 1.2.1 do-not-call list, lookup, search and
// double-booking guard. The desk version itself lives in lib/call-desk.js.
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
  assert.ok(overview.querySelector('main a[href="/portal/call-desk"]'),'employee overview links to the desk');
  for(const route of ['/portal/visits','/portal/crew-room']) assert.equal((await request(route,{cookie:sales})).status,403,route);
});
test('v1.2.0: only the owner edits or deletes calls and deletes questions',async()=>{
  const make=async(key,extra={})=>{const r=await request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:key,business:'Edit Me Roofing',phone:'817-555-0177',outcome:'booked',email:'a@b.test',consult_at:'2026-11-03T10:00',consult_label:'Tue',...extra}});assert.equal(r.status,201);return (await r.json()).id;};
  const id=await make('call-key-0100');
  await request(API+`/calls/${id}/confirm`,{cookie:owner,token:ownerCsrf,body:{}});
  const edit={business:'Edit Me Roofing LLC',phone:'(817) 555-0188',outcome:'booked',email:'a@b.test',consult_at:'2026-11-03T10:00',consult_label:'Tue',notes:'fixed typo'};
  // Employees can't touch it; bad ids and bad bodies are refused.
  assert.equal((await request(API+`/calls/${id}`,{cookie:sales,token:salesCsrf,method:'PATCH',body:edit})).status,403);
  assert.equal((await request(API+`/calls/${id}`,{cookie:sales,token:salesCsrf,method:'DELETE',body:{}})).status,403);
  assert.equal((await request(API+`/calls/${id}`,{cookie:owner,method:'PATCH',body:edit})).status,403,'needs CSRF');
  assert.equal((await request(API+'/calls/not-a-uuid',{cookie:owner,token:ownerCsrf,method:'PATCH',body:edit})).status,404);
  assert.equal((await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:{...edit,consult_at:''}})).status,400,'booked still needs a time');
  // Same booked time keeps the confirmation; phone_norm follows the new phone.
  let r=await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:edit});assert.equal(r.status,200);assert.equal((await r.json()).confirmed,true);
  let row=(await (await request(API+'/state',{cookie:owner})).json()).calls.find(c=>c.id===id);
  assert.equal(row.business,'Edit Me Roofing LLC');assert.equal(row.phone_norm,'8175550188');assert.equal(row.notes,'fixed typo');assert.equal(row.confirmed,true);assert.equal(row.by_name,'Scotty','original author kept');
  // Moving the time drops the confirmation.
  r=await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:{...edit,consult_at:'2026-11-04T14:00'}});assert.equal((await r.json()).confirmed,false);
  // Delete unlinks questions rather than deleting them. Since 1.2.1 the do-not-call flag outlives the call.
  const dnc=await make('call-key-0101',{business:'Wrong Number Co',phone:'940-555-0999',outcome:'dnc',email:'',consult_at:'',consult_label:''});
  const q=await (await request(API+'/questions',{cookie:sales,token:salesCsrf,body:{request_key:'q-key-0100',text:'Test question'}})).json();
  await store.client.execute({sql:'UPDATE calldesk_questions SET call_id=? WHERE id=?',args:[dnc,q.id]});
  assert.ok((await (await request(API+'/state',{cookie:sales})).json()).dnc.some(d=>d.phone_norm==='9405550999'));
  const gone=await request(API+`/calls/${dnc}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}});
  assert.equal(gone.status,200);assert.equal((await gone.json()).dnc_kept,true);
  assert.equal((await request(API+`/calls/${dnc}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,404);
  let s=await (await request(API+'/state',{cookie:sales})).json();
  assert.ok(s.dnc.some(d=>d.phone_norm==='9405550999'),'flag survives the delete');assert.ok(!s.calls.some(c=>c.id===dnc));
  assert.equal(s.questions.find(x=>x.id===q.id).call_id,null);
  // Question delete: owner only.
  assert.equal((await request(API+`/questions/${q.id}`,{cookie:sales,token:salesCsrf,method:'DELETE',body:{}})).status,403);
  assert.equal((await request(API+`/questions/${q.id}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,200);
  s=await (await request(API+'/state',{cookie:owner})).json();
  assert.ok(!s.questions.some(x=>x.id===q.id));
});

test('v1.2.1: a do-not-call flag only comes off when the owner lifts it',async()=>{
  const post=(key,extra)=>request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:key,business:'Thurber Tire, LLC',phone:'(254) 555-0142',outcome:'dnc',...extra}});
  const id=(await (await post('call-key-0200')).json()).id;
  let s=await (await request(API+'/state',{cookie:sales})).json();
  const entry=s.dnc.find(d=>d.phone_norm==='2545550142');assert.ok(entry&&entry.id,'entry carries an id for lifting');
  // Editing the call to another outcome keeps the flag and says so.
  const edited=await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:{business:'Thurber Tire, LLC',phone:'(254) 555-0142',outcome:'notinterested'}});
  assert.equal(edited.status,200);assert.equal((await edited.json()).dnc_kept,true);
  assert.ok((await (await request(API+'/state',{cookie:sales})).json()).dnc.some(d=>d.id===entry.id));
  // A later call to the flagged number is kept, tagged, and reported back.
  const hit=await post('call-key-0201',{outcome:'voicemail',notes:'left a message'});assert.equal(hit.status,201);
  const hitBody=await hit.json();assert.equal(hitBody.dnc_hit,true);
  s=await (await request(API+'/state',{cookie:owner})).json();
  assert.match(s.calls.find(c=>c.id===hitBody.id).notes,/^\[DNC HIT\][^\n]*\nleft a message$/);
  assert.equal((await (await post('call-key-0202',{phone:'254-555-0000',outcome:'voicemail'})).json()).dnc_hit,false);
  // Only the owner lifts, and only once.
  assert.equal((await request(API+`/dnc/${entry.id}`,{cookie:sales,token:salesCsrf,method:'DELETE',body:{}})).status,403);
  assert.equal((await request(API+`/dnc/${entry.id}`,{cookie:owner,method:'DELETE',body:{}})).status,403,'needs CSRF');
  assert.equal((await request(API+'/dnc/not-an-id',{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,404);
  assert.equal((await request(API+`/dnc/${entry.id}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,200);
  assert.equal((await request(API+`/dnc/${entry.id}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,404);
  assert.ok(!(await (await request(API+'/state',{cookie:sales})).json()).dnc.some(d=>d.id===entry.id));
  // Marking the same call do-not-call again brings the lifted entry back.
  await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:{business:'Thurber Tire, LLC',phone:'(254) 555-0142',outcome:'dnc'}});
  assert.ok((await (await request(API+'/state',{cookie:sales})).json()).dnc.some(d=>d.id===entry.id));
});
test('v1.2.1: the schema backfills do-not-call entries from older calls once, and never un-lifts one',async()=>{
  const statements=require('../lib/portal-db').statements();
  const user=(await store.client.execute("SELECT id FROM portal_users WHERE email='sales@example.test'")).rows[0].id;
  // A do-not-call call logged before calldesk_dnc existed: a call row with no list entry.
  await store.client.execute({sql:"INSERT INTO calldesk_calls(id,request_key,created_at,by_user,business,phone,phone_norm,outcome) VALUES('11111111-1111-4111-8111-111111111111','legacy-key-0001',1000,?,'Legacy Lumber','940-555-0166','9405550166','dnc')",args:[user]});
  const count=async()=>Number((await store.client.execute("SELECT COUNT(*) AS n FROM calldesk_dnc WHERE call_id='11111111-1111-4111-8111-111111111111' AND removed_at IS NULL")).rows[0].n);
  assert.equal(await count(),0);
  await store.client.batch(statements,'write');assert.equal(await count(),1);
  await store.client.batch(statements,'write');assert.equal(await count(),1,'re-running adds nothing');
  const s=await (await request(API+'/state',{cookie:sales})).json();
  const entry=s.dnc.find(d=>d.phone_norm==='9405550166');assert.equal(entry.business,'Legacy Lumber');assert.equal(entry.created_at,1000);
  assert.equal((await request(API+`/dnc/${entry.id}`,{cookie:owner,token:ownerCsrf,method:'DELETE',body:{}})).status,200);
  await store.client.batch(statements,'write');assert.equal(await count(),0,'a lifted flag stays lifted across restarts');
});
test('v1.2.1: one consult per time slot, on save and on edit',async()=>{
  const book=(key,business,at)=>request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:key,business,email:'x@y.test',outcome:'booked',consult_at:at,consult_label:'slot'}});
  const first=await book('call-key-0300','Palo Pinto Pest','2026-11-17T09:00');assert.equal(first.status,201);
  const clash=await book('call-key-0301','Santo Septic','2026-11-17T09:00');assert.equal(clash.status,400);
  assert.match((await clash.json()).error,/already booked for Palo Pinto Pest/);
  assert.equal((await (await request(API+'/state',{cookie:sales})).json()).calls.filter(c=>c.business==='Santo Septic').length,0,'nothing half-saved');
  // The refused save can be retried with the other time under the same request key.
  const second=await book('call-key-0301','Santo Septic','2026-11-17T10:00');assert.equal(second.status,201);
  const id=(await second.json()).id;
  const move=await request(API+`/calls/${id}`,{cookie:owner,token:ownerCsrf,method:'PATCH',body:{business:'Santo Septic',email:'x@y.test',outcome:'booked',consult_at:'2026-11-17T09:00'}});
  assert.equal(move.status,400);
  // A non-booked outcome may reuse the time, and a replayed save is not a clash with itself.
  assert.equal((await book('call-key-0300','Palo Pinto Pest','2026-11-17T09:00')).status,201);
});
test('v1.2.1: called-before lookup and log search cover the whole log',async()=>{
  const add=(key,extra)=>request(API+'/calls',{cookie:sales,token:salesCsrf,body:{request_key:key,business:'Lipan 100% Auto',phone:'(254) 555-0188',outcome:'nocontact',...extra}});
  await add('call-key-0400',{notes:'BAD NUMBER: disconnected or wrong.'});await add('call-key-0401',{outcome:'callback',best:'press 2 then 0'});
  const look=async q=>(await request(API+'/lookup?'+q,{cookie:sales})).json();
  let r=await look('phone='+encodeURIComponent('254.555.0188'));
  assert.equal(r.count,2);assert.equal(r.bad_number,true);assert.equal(r.last.outcome,'callback');assert.equal(r.last.best,'press 2 then 0');
  r=await look('business='+encodeURIComponent('  lipan 100% auto '));assert.equal(r.count,2);assert.equal(r.bad_number,false,'bad-number is a phone match only');
  assert.deepEqual(await look('phone=555&business=ab'),{count:0,last:null,bad_number:false});
  assert.equal((await request(API+'/lookup?phone=2545550188',{cookie:client})).status,403);
  assert.equal((await request(API+'/lookup?phone=2545550188')).status,401);
  const find=async q=>(await (await request(API+'/calls/search?q='+encodeURIComponent(q),{cookie:sales})).json()).calls;
  assert.equal((await find('LIPAN')).length,2);assert.equal((await find('(254) 555-0188')).length,2);assert.equal((await find('45550188')).length,2);
  assert.equal((await find('100%')).length,2,'% is matched literally');
  assert.equal((await find('%')).length,2,'a lone % is not a wildcard');
  assert.equal((await find('zzzz')).length,0);
  const row=(await find('lipan'))[0];assert.equal(row.by_name,'Scotty');assert.equal(typeof row.confirmed,'boolean');
  assert.equal((await request(API+'/calls/search?q=',{cookie:sales})).status,400);
  assert.equal((await request(API+'/calls/search?q=lipan',{cookie:client})).status,403);
});
test('v1.2.1: version comes from one place, the script uses the signed-in name, and names normalise',async()=>{
  const html=await (await request('/portal/call-desk',{cookie:sales})).text();
  assert.doesNotMatch(html,/DESK_VERSION/);
  const doc=new JSDOM(html).window.document;
  assert.ok(doc.querySelector(`script[src="/call-desk/app.js?v=${desk.VERSION}"]`));
  assert.match(doc.querySelector('.brand span').textContent,new RegExp('v'+desk.VERSION.replace(/\./g,'\\.')));
  assert.equal(doc.querySelector('meta[name="call-desk-name"]').content,'Scotty');
  assert.ok(doc.querySelector('#dnc-list')&&doc.querySelector('#slot-alert'));
  assert.equal((await (await request(API+'/state',{cookie:sales})).json()).version,desk.VERSION);
  const app=fs.readFileSync(path.join(__dirname,'../public/call-desk/app.js'),'utf8');
  assert.doesNotMatch(app,/Scotty with Ahern AI/,'no hard-coded caller name in the spoken lines');
  for(const node of ['ivr','ivr_menu','ivr_bot','ivr_screen','ivr_service']) assert.match(app,new RegExp('\\n  '+node+': \\{'));
  // Every script step an option points at exists.
  const targets=[...app.matchAll(/to:"([A-Za-z_]+)"/g)].map(m=>m[1]).filter(t=>t!=='FINDOUT');
  for(const t of new Set(targets)) assert.match(app,new RegExp('\\n  '+t+': \\{'),'missing script step '+t);
  assert.equal(desk.normBiz('The Strawn Diner, L.L.C.'),'strawn diner');
  assert.equal(desk.normBiz('Strawn Diner LLC'),'strawn diner');assert.equal(desk.normBiz('  strawn   diner, Inc. '),'strawn diner');
  assert.equal(desk.normBiz('A&B Plumbing Co'),'a and b plumbing');assert.equal(desk.normBiz('Co'),'co');
});
