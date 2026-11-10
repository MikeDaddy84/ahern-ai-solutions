const { report: visitsReport } = require('./site-visits');

// These summaries reuse the tools' authoritative records. They do not log an
// action, complete a task, or interpret an unavailable source as an empty queue.
async function satoriSummary(satori, workspace) {
  const response = await satori.request(workspace, 'GET', '/api/today');
  if (response.status !== 200) throw new Error('Satori unavailable');
  const data = JSON.parse(response.body);
  const tasks = data?.categories?.have_to;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.dayKey || '') || !Array.isArray(tasks) ||
      tasks.some(task => !task || typeof task.id !== 'string' || typeof task.text !== 'string' ||
        task.type !== 'have_to' || !['today', 'done', 'backlog', 'archived'].includes(task.status))) {
    throw new Error('Invalid Satori response');
  }
  const remaining = tasks.filter(task => task.status !== 'done');
  return {
    dayKey: data.dayKey,
    timeZone: 'America/Chicago',
    counts: { total: tasks.length, done: tasks.length - remaining.length, remaining: remaining.length },
    tasks: remaining.map(({ id, text, status }) => ({ id, text, status })),
  };
}

async function callDeskSummary(client, now = Date.now()) {
  // The full Call Desk view caps its history at 500 records. Count the queues
  // directly so older unresolved work cannot disappear from the overview.
  const results = await client.batch([
    { sql: `SELECT
      COALESCE(SUM(status='open'),0) AS openQuestions,
      COALESCE(SUM(status='open' AND due_by < ?),0) AS overdueQuestions,
      COALESCE(SUM(status='answered'),0) AS answeredQuestions
      FROM calldesk_questions`, args: [now] },
    `SELECT COUNT(*) AS unconfirmedConsults FROM calldesk_calls WHERE outcome='booked' AND confirmed=0`,
    `SELECT id,business,contact,text,due_by FROM calldesk_questions
      WHERE status='open' ORDER BY due_by,asked_at,id LIMIT 4`,
    `SELECT id,business,contact,text,answer,answered_at FROM calldesk_questions
      WHERE status='answered' ORDER BY answered_at,asked_at,id LIMIT 4`,
    `SELECT id,business,contact,consult_at,consult_label FROM calldesk_calls
      WHERE outcome='booked' AND confirmed=0 ORDER BY consult_at,created_at,id LIMIT 4`,
  ], 'read');
  const counts = {
    openQuestions: Number(results[0].rows[0].openQuestions),
    overdueQuestions: Number(results[0].rows[0].overdueQuestions),
    answeredQuestions: Number(results[0].rows[0].answeredQuestions),
    unconfirmedConsults: Number(results[1].rows[0].unconfirmedConsults),
  };
  // This counts work items, not unique prospects. Callback/send-info outcomes
  // are not included: those records have no completed flag or structured due date.
  counts.actionable = counts.openQuestions + counts.answeredQuestions + counts.unconfirmedConsults;
  const question = row => ({ id: String(row.id), business: String(row.business), contact: String(row.contact), text: String(row.text) });
  return {
    timeZone: 'America/Chicago', counts,
    openQuestions: results[2].rows.map(row => ({ ...question(row), dueBy: Number(row.due_by), overdue: Number(row.due_by) < now })),
    answeredQuestions: results[3].rows.map(row => ({ ...question(row), answer: String(row.answer), answeredAt: row.answered_at === null ? null : Number(row.answered_at) })),
    unconfirmedConsults: results[4].rows.map(row => ({ id: String(row.id), business: String(row.business), contact: String(row.contact), consultAt: String(row.consult_at), consultLabel: String(row.consult_label) })),
  };
}

function install(router, { database, satori }) {
  const messages = {
    satori: 'Satori could not be loaded. Open Satori or try again.',
    visits: 'Site visits could not be loaded. This does not mean there were zero page views.',
    'call-desk': 'Call Desk could not be loaded. Your follow-up queue is not available yet.',
  };
  router.get('/api/portal/overview/:widget', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.portalUser) return res.status(401).json({ status: 'unavailable', message: 'Please sign in again.' });
    const { widget } = req.params;
    if (!Object.hasOwn(messages, widget)) return res.status(404).json({ status: 'unavailable', message: 'Widget not found.' });
    if ((widget === 'visits' && req.portalUser.role !== 'owner') ||
        (widget === 'call-desk' && !['owner', 'employee'].includes(req.portalUser.role))) {
      return res.status(403).json({ status: 'unavailable', message: 'This tool is not available for your account.' });
    }
    try {
      let data;
      if (widget === 'satori') data = await satoriSummary(satori, req.portalUser.workspace_key);
      if (widget === 'visits') {
        const { counts, days, today } = await database.withClient(visitsReport);
        data = { timeZone: 'UTC', metric: 'pageViews', today, counts, days };
      }
      if (widget === 'call-desk') data = await callDeskSummary(req.portalStore.client);
      res.json({ status: 'ready', updatedAt: new Date().toISOString(), ...data });
    } catch {
      res.status(503).json({ status: 'unavailable', message: messages[widget] });
    }
  });
}

module.exports = { install, satoriSummary, callDeskSummary };
