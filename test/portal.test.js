const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createClient } = require('@libsql/client');
const { JSDOM } = require('jsdom');
const auth = require('../lib/portal-auth');
const portal = require('../lib/portal');
const satori = require('../lib/satori');
let server, origin, directory, store, alice, bob, aliceToken, bobToken;
const pass='sample-only-password-2869';
function cookie(response) { return response.headers.get('set-cookie').split(';')[0]; }
async function call(route, {who, csrf, method='GET', body, source=origin}={}) {
  return fetch(origin+route,{method,redirect:'manual',headers:{...(who?{Cookie:who}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(method!=='GET'?{'Content-Type':'application/json',Origin:source}:{} )},...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
test.before(async()=> {
  delete process.env.PORTAL_DATABASE_URL;delete process.env.TURSO_DATABASE_URL;delete process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV='test';
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'ahern-portal-test-'));
  const dbUrl=name=>'file:'+path.join(directory,name+'.db').replace(/\\/g,'/');
  process.env.SATORI_DATABASE_URL=dbUrl('existing-satori');
  delete process.env.SATORI_AUTH_TOKEN;
  delete process.env.SATORI_WORKSPACE_CALENDARS_JSON;
  store=auth.createStore(createClient({url:process.env.SATORI_DATABASE_URL}));
  // Existing application data must survive the additive portal migration exactly.
  await store.client.batch([
    'CREATE TABLE tasks(id TEXT PRIMARY KEY,text TEXT)',
    "INSERT INTO tasks VALUES('legacy-task','Existing personal agenda')",
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)',
    "INSERT INTO app_meta VALUES('last_rollover_day','2026-01-01')",
    'CREATE TABLE day_log(day_key TEXT PRIMARY KEY,summary_json TEXT)',
    "INSERT INTO day_log VALUES('2026-01-01','legacy-history')"
  ],'write');
  await store.provision({email:'alice@example.test',name:'Alice',password:pass,workspace:'alice',role:'owner'});
  await store.provision({email:'bob@example.test',name:'Bob',password:pass,workspace:'bob',role:'client'});
  const app=express();app.use(express.json());app.use(portal.createRouter({storeProvider:()=>store}));app.get('/public',(req,res)=>res.send('public'));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;
});
test.after(async()=> {satori.close();await new Promise(resolve=>server.close(resolve));store.client.close();});
test('front door is navigable, preview is labeled, private pages are gated, and public pages retain indexing',async()=> {
  assert.equal((await call('/public')).headers.get('x-robots-tag'),null);
  const response=await call('/login');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const doc=new JSDOM(await response.text()).window.document;
  assert.ok(doc.querySelector('input[autocomplete="current-password"]'));
  const preview=await call('/portal/preview/satori');assert.equal(preview.status,200);const html=await preview.text();
  assert.match(html,/Portal preview/);assert.match(html,/data-preview="true"/);assert.doesNotMatch(html,/<iframe/);
  assert.match(html,/portal\/satori-assets\/assets\/index-/);
  for(const route of ['/portal','/portal/settings','/portal/satori']) {const res=await call(route);assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/login');}
  assert.equal((await call('/api/portal/satori/today')).status,401);
  assert.equal((await call('/api/portal/profile',{method:'PATCH',body:{name:'Intruder'}})).status,401);
});
test('sign-in is origin checked, credentials are hashed, and sessions use protected cookies',async()=> {
  const denied=await call('/api/portal/login',{method:'POST',source:'https://evil.example',body:{email:'alice@example.test',password:pass}});assert.equal(denied.status,403);
  const wrong=await call('/api/portal/login',{method:'POST',body:{email:'alice@example.test',password:'wrong'}});assert.equal(wrong.status,401);
  const res=await call('/api/portal/login',{method:'POST',body:{email:'ALICE@example.test',password:pass}});assert.equal(res.status,200);alice=cookie(res);
  assert.match(res.headers.get('set-cookie'),/HttpOnly/);assert.match(res.headers.get('set-cookie'),/SameSite=Strict/);
  const second=await call('/api/portal/login',{method:'POST',body:{email:'bob@example.test',password:pass}});assert.equal(second.status,200);bob=cookie(second);
  const details=await (await call('/api/portal/me',{who:alice})).json();aliceToken=details.csrf;assert.equal(details.role,'owner');assert.equal(details.workspace_key,undefined);
  bobToken=(await (await call('/api/portal/me',{who:bob})).json()).csrf;
  const rows=await store.client.execute('SELECT password_hash FROM portal_users');assert.ok(rows.rows.every(row=>row.password_hash.startsWith('scrypt:') && !row.password_hash.includes(pass)));
  const sessions=await store.client.execute('SELECT token_hash FROM portal_sessions');assert.ok(sessions.rows.every(row=>!alice.includes(row.token_hash)));
});
test('task writes enforce CSRF and account isolation in ONE shared Satori database',async()=> {
  assert.equal(satori.configuration('alice').url,satori.configuration('bob').url);
  const task={text:'Alice private task',type:'have_to',target:'today'};
  assert.equal((await call('/api/portal/satori/tasks',{who:alice,method:'POST',body:task})).status,403);
  assert.equal((await call('/api/portal/satori/tasks',{who:alice,csrf:aliceToken,method:'POST',source:'https://evil.example',body:task})).status,403);
  const added=await call('/api/portal/satori/tasks',{who:alice,csrf:aliceToken,method:'POST',body:task});assert.equal(added.status,201,await added.clone().text());const item=await added.json();
  const other=await (await call('/api/portal/satori/today',{who:bob})).json();assert.deepEqual(other.categories.have_to,[]);
  const tampered=await call('/api/portal/satori/tasks/'+item.id,{who:bob,csrf:bobToken,method:'PATCH',body:{text:'Stolen'}});assert.equal(tampered.status,400);
  await call('/api/portal/satori/tasks/'+item.id,{who:bob,csrf:bobToken,method:'DELETE'});
  const retained=await (await call('/api/portal/satori/today?workspace=alice',{who:alice})).json();assert.equal(retained.categories.have_to[0].text,'Alice private task');
  const completed=await call('/api/portal/satori/tasks/'+item.id,{who:alice,csrf:aliceToken,method:'PATCH',body:{status:'done'}});assert.equal(completed.status,200);assert.equal((await completed.json()).status,'done');
  assert.equal((await call('/api/portal/satori/tasks',{who:bob,csrf:bobToken,method:'POST',body:{text:7,type:'bogus'}})).status,400);
  assert.equal((await call('/api/portal/satori/history?limit=-1',{who:bob})).status,400);
  assert.deepEqual((await (await call('/api/portal/satori/calendar',{who:bob})).json()).sources,[]);
  for(const key of ['alice','bob']) {const result=await store.client.execute({sql:"SELECT value FROM portal_satori_meta WHERE workspace_key=? AND key='last_rollover_day'",args:[key]});assert.equal(result.rows.length,1,'rollover state is independent for '+key);}
  const aliceDb=createClient({url:satori.configuration('alice').url});
  await aliceDb.execute({sql:'INSERT INTO portal_satori_day_log(workspace_key,day_key,created_at,summary_json) VALUES(?,?,?,?)',args:['alice','2026-01-01',Date.now(),JSON.stringify({tasks:[{text:'Alice private history'}]})]});aliceDb.close();
  assert.equal((await (await call('/api/portal/satori/history',{who:alice})).json())[0].summary.tasks[0].text,'Alice private history');
  assert.deepEqual(await (await call('/api/portal/satori/history',{who:bob})).json(),[]);
});
test('profile changes cannot select another account; logout and expiration revoke access',async()=> {
  const save=await call('/api/portal/profile',{who:alice,csrf:aliceToken,method:'PATCH',body:{name:'<script>test</script>',id:'bob'}});assert.equal(save.status,200);
  const html=await (await call('/portal',{who:alice})).text();assert.match(html,/&lt;script&gt;test&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>test/);
  assert.equal((await (await call('/api/portal/me',{who:bob})).json()).name,'Bob');
  const logout=await call('/api/portal/logout',{who:alice,csrf:aliceToken,method:'POST'});assert.equal(logout.status,200);assert.equal((await call('/api/portal/me',{who:alice})).status,401);
  await store.client.execute('UPDATE portal_sessions SET expires_at=0');assert.equal((await call('/api/portal/me',{who:bob})).status,401);
});
test('all accounts reuse the existing DB while workspace context and calendars remain server owned',()=> {
  assert.equal(satori.configuration('alice').url,process.env.SATORI_DATABASE_URL);
  assert.equal(satori.configuration('new-employee').url,process.env.SATORI_DATABASE_URL);
  assert.throws(()=>satori.configuration('../alice'),/Invalid workspace/);
  process.env.SATORI_WORKSPACE_CALENDARS_JSON=JSON.stringify({alice:{calendarUrl:'https://calendar.example/owner-only',url:'libsql://ignored.example'}});
  assert.equal(satori.configuration('bob').calendarUrl,'');
  assert.equal(satori.configuration('alice').url,process.env.SATORI_DATABASE_URL);
  delete process.env.SATORI_WORKSPACE_CALENDARS_JSON;
  process.env.NODE_ENV='production';assert.equal(auth.cookieOptions().secure,true);process.env.NODE_ENV='test';
});
test('account setup is create-only, expires, consumes once, and activates only its bound owner',async()=> {
  const value=await store.setupAccount({email:'new-owner@example.test',name:'New owner',workspace:'new-owner',role:'owner'});
  const row=(await store.client.execute("SELECT * FROM portal_users WHERE email='new-owner@example.test'")).rows[0];
  assert.equal(row.disabled,1);
  const setupRow=(await store.client.execute({sql:'SELECT * FROM portal_account_setup WHERE user_id=?',args:[row.id]})).rows[0];
  assert.notEqual(setupRow.token_hash,value);
  await assert.rejects(()=>store.setupAccount({email:'new-owner@example.test',name:'Replacement',workspace:'replacement'}));
  const body={token:value,password:pass};
  assert.equal((await call('/api/portal/setup',{method:'POST',source:'https://evil.example',body})).status,403);
  assert.equal((await call('/api/portal/setup',{method:'POST',body:{...body,password:'short'}})).status,400);
  assert.equal((await call('/api/portal/setup',{method:'POST',body:{...body,token:'0'.repeat(64)}})).status,400);
  const results=await Promise.all([call('/api/portal/setup',{method:'POST',body}),call('/api/portal/setup',{method:'POST',body})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const session=await store.login('new-owner@example.test',pass);
  const user=await store.session(session);assert.equal(user.role,'owner');assert.equal(user.workspace_key,'new-owner');
  assert.equal(await store.finishSetup(value,'replacement-password-123'),false);
  const expired=await store.setupAccount({email:'expired@example.test',name:'Expired',workspace:'expired'});
  await store.client.execute('UPDATE portal_account_setup SET expires_at=0');
  assert.equal(await store.finishSetup(expired,pass),false);
  assert.equal(await store.login('expired@example.test',pass),null);
  const page=await call('/portal/setup');assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert.match(await page.text(),/autocomplete="new-password"/);
});
test('rollover, same-ID updates, history upserts and retention stay inside the workspace',async()=> {
  const old=Date.now()-100*86400000;
  for(const key of ['alice','bob']) {
    await store.client.batch([
      {sql:'INSERT INTO portal_satori_tasks(workspace_key,id,text,type,status,date_added,day_key) VALUES(?,?,?,?,?,?,?)',args:[key,'shared-id',key+' carryover','have_to','today',old,'2026-01-01']},
      {sql:'INSERT INTO portal_satori_tasks(workspace_key,id,text,type,status,date_added,date_done) VALUES(?,?,?,?,?,?,?)',args:[key,'old-done',key+' completed','want_to','done',old,old]},
      {sql:'INSERT INTO portal_satori_tasks(workspace_key,id,text,type,status,date_added) VALUES(?,?,?,?,?,?)',args:[key,'backlog-item',key+' backlog','need_to','backlog',old]},
      {sql:'UPDATE portal_satori_meta SET value=? WHERE workspace_key=? AND key=?',args:['2026-01-01',key,'last_rollover_day']},
      {sql:'INSERT OR REPLACE INTO portal_satori_day_log(workspace_key,day_key,created_at,summary_json) VALUES(?,?,?,?)',args:[key,'2026-01-01',Date.now(),JSON.stringify({tasks:[{text:key+' snapshot'}]})]},
      {sql:'INSERT INTO portal_satori_day_log(workspace_key,day_key,created_at,summary_json) VALUES(?,?,?,?)',args:[key,'2000-01-01',old,'{}']}
    ],'write');
  }
  const first=await satori.request('alice','POST','/api/rollover',{});assert.equal(first.status,200,first.body);
  const bobTasks=(await store.client.execute("SELECT id,status,day_key FROM portal_satori_tasks WHERE workspace_key='bob' ORDER BY id")).rows;
  assert.equal(bobTasks.find(row=>row.id==='old-done').status,'done');
  assert.equal(bobTasks.find(row=>row.id==='shared-id').day_key,'2026-01-01');
  assert.equal(bobTasks.find(row=>row.id==='backlog-item').status,'backlog');
  assert.equal((await store.client.execute("SELECT value FROM portal_satori_meta WHERE workspace_key='bob' AND key='last_rollover_day'")).rows[0].value,'2026-01-01');
  const history=(await store.client.execute("SELECT workspace_key,day_key,summary_json FROM portal_satori_day_log ORDER BY workspace_key,day_key")).rows;
  assert.equal(history.some(row=>row.workspace_key==='alice' && row.day_key==='2000-01-01'),false);
  assert.equal(history.some(row=>row.workspace_key==='bob' && row.day_key==='2000-01-01'),true);
  assert.equal(JSON.parse(history.find(row=>row.workspace_key==='bob'&&row.day_key==='2026-01-01').summary_json).tasks[0].text,'bob snapshot');
  assert.equal(JSON.parse(history.find(row=>row.workspace_key==='alice'&&row.day_key==='2026-01-01').summary_json).tasks[0].text,'alice carryover');
  const second=await satori.request('bob','POST','/api/rollover',{});assert.equal(second.status,200,second.body);
  assert.equal((await store.client.execute("SELECT count(*) AS count FROM portal_satori_day_log WHERE day_key='2026-01-01'")).rows[0].count,2);
  const update=await satori.request('alice','PATCH','/api/tasks/shared-id',{text:'Only Alice changed'});assert.equal(update.status,200,update.body);
  assert.equal((await store.client.execute("SELECT text FROM portal_satori_tasks WHERE workspace_key='bob' AND id='shared-id'")).rows[0].text,'bob carryover');
  await satori.request('alice','DELETE','/api/tasks/shared-id');
  assert.equal((await store.client.execute("SELECT count(*) AS count FROM portal_satori_tasks WHERE workspace_key='bob' AND id='shared-id'")).rows[0].count,1);
});
test('additive migration is idempotent and original Satori tables remain unchanged',async()=> {
  await store.client.batch(require('../lib/portal-db').statements(),'write');
  assert.equal((await store.client.execute('SELECT text FROM tasks')).rows[0].text,'Existing personal agenda');
  assert.equal((await store.client.execute('SELECT value FROM app_meta')).rows[0].value,'2026-01-01');
  assert.equal((await store.client.execute('SELECT summary_json FROM day_log')).rows[0].summary_json,'legacy-history');
  const columns=(await store.client.execute('PRAGMA table_info(tasks)')).rows.map(row=>row.name);
  assert.deepEqual(columns,['id','text']);
});
