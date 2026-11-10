const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createClient } = require('@libsql/client');
const overview = require('../lib/overview');
const portal = require('../lib/portal');
const auth = require('../lib/portal-auth');

test('Have Tos use the signed-in workspace and distinguish outstanding tasks from completed tasks', async () => {
  const calls = [];
  const source = {
    dayKey: '2026-11-10',
    categories: {
      have_to: [
        { id: 'open', text: 'Review the plan', type: 'have_to', status: 'today', workspaceKey: 'private' },
        { id: 'done', text: 'Completed task', type: 'have_to', status: 'done' },
      ],
      need_to: [{ id: 'need', text: 'Not a Have To', type: 'need_to', status: 'today' }],
    },
  };
  const satori = { request: async (...args) => { calls.push(args); return { status: 200, body: JSON.stringify(source) }; } };
  const result = await overview.satoriSummary(satori, 'alice');
  assert.deepEqual(calls, [['alice', 'GET', '/api/today']]);
  assert.deepEqual(result.counts, { total: 2, done: 1, remaining: 1 });
  assert.deepEqual(result.tasks, [{ id: 'open', text: 'Review the plan', status: 'today' }]);
  assert.equal(result.dayKey, '2026-11-10');
  assert.equal(result.timeZone, 'America/Chicago');
  for (const response of [
    { status: 503, body: '{}' },
    { status: 200, body: '{invalid' },
    { status: 200, body: JSON.stringify({ dayKey: '2026-11-10', categories: {} }) },
  ]) await assert.rejects(() => overview.satoriSummary({ request: async () => response }, 'alice'));
});

test('Call Desk totals include older unresolved work beyond 500 records and cap each preview at four', async () => {
  const client = createClient({ url: 'file::memory:' });
  const now = Date.parse('2026-11-10T15:00:00Z');
  try {
    await client.batch(require('../lib/portal-db').statements(), 'write');
    await client.execute("INSERT INTO portal_users(id,email,name,password_hash,workspace_key,role) VALUES('owner','owner@example.test','Owner','unused','owner','owner')");
    const questions = [];
    const question = (id, status, asked, due) => ({
      sql: `INSERT INTO calldesk_questions(id,request_key,asked_at,due_by,by_user,text,reach,status,business,answer,answered_at)
        VALUES(?,?,?,?,? ,?,'email',?,?,?,?)`,
      args: [id, id, asked, due, 'owner', 'Question ' + id, status, 'Business ' + id, status === 'answered' ? 'Saved answer' : '', status === 'answered' ? asked : null],
    });
    for (let i = 0; i < 501; i++) questions.push(question('closed-' + i, 'relayed', now + i, now));
    for (let i = 0; i < 6; i++) questions.push(question('open-' + i, 'open', now - 1000 + i, now - 5 + i));
    for (let i = 0; i < 5; i++) questions.push(question('answer-' + i, 'answered', now - 1000 + i, now));
    await client.batch(questions, 'write');
    const calls = [];
    for (let i = 0; i < 5; i++) calls.push({
      sql: `INSERT INTO calldesk_calls(id,request_key,created_at,by_user,business,outcome,consult_at) VALUES(?,?,?,'owner',?,'booked',?)`,
      args: ['booking-' + i, 'booking-' + i, now + i, 'Booking ' + i, '2026-11-11T1' + i + ':00'],
    });
    for (const outcome of ['callback', 'sendinfo', 'dnc']) calls.push({
      sql: `INSERT INTO calldesk_calls(id,request_key,created_at,by_user,outcome) VALUES(?,?,?,'owner',?)`,
      args: [outcome, outcome, now, outcome],
    });
    calls.push({ sql: `INSERT INTO calldesk_calls(id,request_key,created_at,by_user,outcome,confirmed) VALUES('confirmed','confirmed',?,'owner','booked',1)`, args: [now] });
    await client.batch(calls, 'write');
    const result = await overview.callDeskSummary(client, now);
    assert.deepEqual(result.counts, { openQuestions: 6, overdueQuestions: 5, answeredQuestions: 5, unconfirmedConsults: 5, actionable: 16 });
    for (const key of ['openQuestions', 'answeredQuestions', 'unconfirmedConsults']) assert.equal(result[key].length, 4);
    assert.deepEqual(result.openQuestions.map(item => item.id), ['open-0', 'open-1', 'open-2', 'open-3']);
    assert.ok(result.openQuestions.every(item => item.overdue));
    assert.equal(result.answeredQuestions[0].answer, 'Saved answer');
    assert.equal(result.unconfirmedConsults[0].consultAt, '2026-11-11T10:00');
    assert.equal(result.unconfirmedConsults[0].email, undefined);
    await client.batch(['DELETE FROM calldesk_questions', 'DELETE FROM calldesk_calls'], 'write');
    assert.equal((await overview.callDeskSummary(client, now)).counts.actionable, 0);
  } finally { client.close(); }
});

test('overview APIs enforce real portal sessions and tool roles, isolate workspaces, and preserve failure states', async () => {
  const client = createClient({ url: 'file::memory:' });
  const store = auth.createStore(client);
  const seen = [];
  let server, visitsFailed = false, satoriFailed = false, visitReads = 0;
  const password = 'overview-test-password-only';
  try {
    for (const role of ['owner', 'employee', 'member', 'client']) await store.provision({ email: role + '@example.test', name: role, password, workspace: role, role });
    await client.execute('CREATE TABLE pageviews(path TEXT, created_at TEXT)');
    const today = new Date().toISOString().slice(0, 10);
    await client.batch(['/', '/blog', '/portal', '/api/private', '/login', '/leads'].map(path => ({ sql: 'INSERT INTO pageviews VALUES(?,?)', args: [path, today + ' 00:00:00'] })), 'write');
    const deps = {
      storeProvider: () => store,
      database: { withClient: async run => { visitReads++; if (visitsFailed) throw Error('secret database location'); return run(client); } },
      satori: { request: async (workspace, method, route) => {
        seen.push({ workspace, method, route });
        if (satoriFailed) return { status: 503, body: '{"secret":"internal"}' };
        return { status: 200, body: JSON.stringify({ dayKey: '2026-11-10', categories: { have_to: [{ id: workspace, text: workspace + ' private priority', type: 'have_to', status: 'today' }] } }) };
      } },
    };
    const app = express(); app.use(express.json());
    const router = portal.createRouter(deps);
    // The module can be exercised before or after portal.js installs it: the
    // portal session middleware always precedes this fallback registration.
    overview.install(router, deps);
    app.use(router);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const get = (widget, cookie) => fetch(origin + '/api/portal/overview/' + widget, { headers: cookie ? { Cookie: cookie } : {} });
    for (const widget of ['satori', 'visits', 'call-desk']) assert.equal((await get(widget)).status, 401);
    const cookies = {};
    for (const role of ['member', 'client', 'employee', 'owner']) {
      cookies[role] = auth.COOKIE + '=' + await store.login(role + '@example.test', password);
      const priorities = await get('satori?workspace=owner', cookies[role]);
      assert.equal(priorities.status, 200);
      assert.equal(priorities.headers.get('cache-control'), 'no-store');
      assert.deepEqual((await priorities.json()).tasks, [{ id: role, text: role + ' private priority', status: 'today' }]);
      assert.equal((await get('visits', cookies[role])).status, role === 'owner' ? 200 : 403);
      assert.equal((await get('call-desk', cookies[role])).status, ['owner', 'employee'].includes(role) ? 200 : 403);
      if (role !== 'owner') assert.equal(visitReads, 0, 'access checks precede owner-only database reads');
    }
    assert.deepEqual(seen.map(item => item.workspace), ['member', 'client', 'employee', 'owner']);
    assert.ok(seen.every(item => item.method === 'GET' && item.route === '/api/today'));
    const visits = await (await get('visits', cookies.owner)).json();
    assert.equal(visits.status, 'ready');
    assert.equal(visits.counts.today, 2, 'private portal and API paths stay excluded');
    assert.equal(visits.days.length, 30);
    assert.equal(visits.days.at(-1).views, 2);
    assert.equal(visits.timeZone, 'UTC');
    assert.equal(visits.metric, 'pageViews');
    assert.ok(Number.isFinite(Date.parse(visits.updatedAt)));
    assert.equal((await get('relay', cookies.owner)).status, 404, 'no implied external source');
    visitsFailed = true;
    let failed = await get('visits', cookies.owner);
    assert.equal(failed.status, 503);
    let body = await failed.json();
    assert.equal(body.status, 'unavailable'); assert.equal(body.counts, undefined);
    assert.doesNotMatch(JSON.stringify(body), /secret database/);
    assert.equal((await get('satori', cookies.owner)).status, 200, 'one failed tool leaves others available');
    satoriFailed = true;
    failed = await get('satori', cookies.owner); assert.equal(failed.status, 503);
    body = await failed.json(); assert.equal(body.counts, undefined); assert.doesNotMatch(JSON.stringify(body), /internal/);
    await client.execute('DROP TABLE calldesk_questions');
    failed = await get('call-desk', cookies.owner); assert.equal(failed.status, 503);
    assert.equal((await failed.json()).counts, undefined);
    await store.logout(cookies.owner.split('=')[1]);
    assert.equal((await get('satori', cookies.owner)).status, 401);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    client.close();
  }
});
