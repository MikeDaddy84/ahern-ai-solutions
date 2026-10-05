const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {createClient} = require('@libsql/client');
const {JSDOM} = require('jsdom');
const {report,render} = require('../lib/site-visits');
const portal = require('../lib/portal');
const auth = require('../lib/portal-auth');

test('counts date boundaries, excludes private paths, fills missing days, and escapes page names', async () => {
  const client=createClient({url:'file::memory:'});
  try {
    await client.execute('CREATE TABLE pageviews(path TEXT, created_at TEXT)');
    for(const [path,date] of [['/','2026-10-05 00:00:00'],['/blog','2026-09-29 00:00:00'],['/blog','2026-09-28 23:59:59'],['/old','2026-09-06 00:00:00'],['/older','2026-09-05 23:59:59'],['/portal','2026-10-05 10:00:00'],['/login','2026-10-05 10:00:00'],['/api/track','2026-10-05 10:00:00'],['/leads','2026-10-05 10:00:00'],['/<script>?secret=hidden','2026-10-05 10:00:00'],['/future','2026-10-06 00:00:00']]) {
      await client.execute({sql:'INSERT INTO pageviews VALUES(?,?)',args:[path,date]});
    }
    const data=await report(client,new Date('2026-10-05T12:00:00Z'));
    assert.deepEqual(data.counts,{total:6,today:2,week:3,month:5});
    assert.equal(data.days.length,30);assert.equal(data.days[0].day,'2026-09-06');
    assert.equal(data.days[1].views,0);assert.equal(data.days[29].views,2);
    assert.equal(data.pages[0].page,'/blog');assert.equal(Number(data.pages[0].views),2);
    const html=render(data);assert.doesNotMatch(html,/<script>|secret=hidden/);assert.match(html,/&lt;script&gt;/);
    assert.equal(new JSDOM(html).window.document.querySelectorAll('.visit-card').length,4);
    await client.execute('DELETE FROM pageviews');
    const empty=await report(client);assert.equal(empty.counts.total,0);assert.match(render(empty),/No public page views recorded yet/);
  } finally {client.close();}
});

test('real portal sessions enforce owner access, private caching, preview exclusion, and outage state', async () => {
  const client=createClient({url:'file::memory:'});
  const store=auth.createStore(client);
  let server,failed=false,reads=0;
  try {
    for(const role of ['owner','client','employee','member']) await store.provision({email:role+'@example.test',name:role,password:'visits-test-password-only',workspace:role,role});
    const app=express();app.use(express.json());
    const data={counts:{total:14,today:2,week:8,month:14},today:'2026-10-05',days:[{day:'2026-10-05',views:2}],pages:[]};
    app.use(portal.createRouter({storeProvider:()=>store,database:{withClient:async()=>{reads++;if(failed)throw Error('private database detail');return data;}}}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const get=(path,cookie)=>fetch(origin+path,{redirect:'manual',headers:cookie?{Cookie:cookie}:{}});
    const anon=await get('/portal/visits');assert.equal(anon.status,303);assert.equal(anon.headers.get('location'),'/login');
    assert.doesNotMatch(await (await get('/portal/preview')).text(),/href="\/portal\/visits"/);
    for(const role of ['client','employee','member','owner']) {
      const token=await store.login(role+'@example.test','visits-test-password-only');const cookie=auth.COOKIE+'='+token;
      const response=await get('/portal/visits',cookie);const html=await response.text();
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      assert.equal(response.status,role==='owner'?200:403);
      if(role!=='owner') {assert.doesNotMatch(html,/Daily page views|href="\/portal\/visits"/);assert.equal(reads,0);}
      else {
        assert.match(html,/aria-current="page"[^>]*>.*?Site visits/);
        assert.doesNotMatch(html,/src="\/script.js/);
        failed=true;const unavailable=await get('/portal/visits',cookie);assert.equal(unavailable.status,503);
        const message=await unavailable.text();assert.match(message,/does not mean there were zero visits/);assert.doesNotMatch(message,/private database detail/);
      }
    }
  } finally {if(server)await new Promise(resolve=>server.close(resolve));client.close();}
});
