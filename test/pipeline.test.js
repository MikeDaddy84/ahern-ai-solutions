const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const file = path.join(os.tmpdir(), 'ahern-pipeline-' + crypto.randomUUID() + '.db');
process.env.TURSO_DATABASE_URL = 'file:' + file.replace(/\\/g, '/');
process.env.LEADS_DASHBOARD_PASSWORD = 'local-test-password-123456';
process.env.NODE_ENV = 'test';
for (const key of ['TURSO_AUTH_TOKEN','SITE_GATE_PASSWORD','RESEND_API_KEY','SMTP_HOST']) delete process.env[key];
const app = require('../server');
const db = require('../lib/db');
const leads = require('../lib/leads');
const contact = require('../lib/contact');
const pipeline = require('../lib/pipeline');
let server, origin;
const auth = 'Basic ' + Buffer.from('mike:' + process.env.LEADS_DASHBOARD_PASSWORD).toString('base64');
test.before(async () => {await db.whenReady();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;});
test.after(async () => {
  server.closeAllConnections(); await new Promise(r=>server.close(r)); await db.withClient(c=>c.close());
  for(const suffix of ['','-wal','-shm']) {
    try { fs.rmSync(file+suffix,{force:true}); }
    catch (err) { // Native libSQL can retain a Windows file handle until process exit.
      if (process.platform !== 'win32' || !['EPERM','EBUSY'].includes(err.code)) throw err;
    }
  }
});

test('qualified inquiry persists once, queues notification, and supports authenticated status updates', async () => {
  const payload = {name:'Test visitor',email:'visitor@example.test',interest:'Everyday or office PC',message:'Office build',budget:'1500-5000',timeline:'This quarter',projectDetails:'Spreadsheet use',context:'A sample plan',requestId:'growth-test-request-1234'};
  async function send() {return fetch(origin+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
  const accepted = await (await send()).json(); assert.equal(accepted.persisted,true);
  assert.equal((await (await send()).json()).reference,accepted.reference);
  const rows = await db.withClient(leads.list); assert.equal(rows.length,1); assert.equal(rows[0].stage,'new');
  assert.match(rows[0].message,/Project budget: 1500-5000/); assert.match(rows[0].message,/Planning notes: A sample plan/);
  const page = await fetch(origin+'/leads',{headers:{Authorization:auth}}); assert.equal(page.status,200);
  const dom = new JSDOM(await page.text()), form = dom.window.document.querySelector('.lead-edit');
  const params = new URLSearchParams({csrf:form.querySelector('[name=csrf]').value,stage:'won',revenue:'2000',direct_cost:'1400',delivery_hours:'5.5',outcome_note:'<script>unsafe</script>'});
  const url = origin+form.getAttribute('action');
  assert.equal((await fetch(url,{method:'POST',body:params})).status,401);
  const bad = new URLSearchParams(params); bad.set('csrf','0'.repeat(64));
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:auth},body:bad})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:auth},body:params,redirect:'manual'})).status,303);
  let row = (await db.withClient(leads.list))[0]; assert.equal(row.stage,'won'); assert.equal(row.delivery_hours,5.5); assert.equal(row.revenue-row.direct_cost,600);
  const html = await (await fetch(origin+'/leads',{headers:{Authorization:auth}})).text(); assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;')); assert.ok(!html.includes('<script>unsafe'));
  params.set('direct_cost','-1'); assert.equal((await fetch(url,{method:'POST',headers:{Authorization:auth},body:params})).status,400);
  row=(await db.withClient(leads.list))[0]; assert.equal(row.direct_cost,1400); dom.window.close();
});

test('pipeline rejects malformed values, scopes tokens to the inquiry and preserves zero costs', () => {
  for(const change of [{stage:'delete'},{revenue:'-1'},{direct_cost:'NaN'},{delivery_hours:'1e4'},{outcome_note:{}}]) assert.throws(()=>leads.validatePipeline({stage:'new',...change}));
  assert.equal(pipeline.validToken(2,pipeline.token(1)),false);
  assert.match(pipeline.form({id:1,stage:'new',revenue:0,direct_cost:0,delivery_hours:0}),/name="revenue" value="0"/);
  for(const change of [{context:'x'.repeat(3001)},{projectDetails:[]},{budget:{}}]) assert.throws(()=>contact.validate({name:'Example',email:'a@example.test',interest:'AI automation',...change}));
});

test('event storage records only the allowlisted event and service', async () => {
  const response=await fetch(origin+'/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'assessment_completed',service:'websites',email:'must-not-store@example.test',answers:'private'})});
  assert.equal(response.status,204);
  const rows=await db.withClient(c=>c.execute('SELECT * FROM site_events')); assert.equal(rows.rows.length,1);
  assert.deepEqual(Object.keys(rows.rows[0]).sort(),['created_at','event','id','service']);
  assert.equal(db.validEvent({event:'unknown',service:'websites'}),false);
  assert.equal(db.validEvent({event:'quote_requested',service:'unknown'}),false);
  assert.equal((await db.withClient(db.eventCounts))[0].count,1);
});
