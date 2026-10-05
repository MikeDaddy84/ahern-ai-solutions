const { escapeHtml: h } = require('./layout');

// Only public website paths belong in this report. Historical records remain intact.
const PUBLIC = `path LIKE '/%' AND path NOT LIKE '//%'
  AND path NOT GLOB '/portal*' AND path NOT GLOB '/api*'
  AND path NOT GLOB '/login*' AND path NOT GLOB '/leads*'
  AND path NOT GLOB '/health*'`;

async function report(client, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const day = offset => new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const results = await client.batch([
    {sql: `SELECT COUNT(*) AS total,
      COALESCE(SUM(created_at >= ?),0) AS today,
      COALESCE(SUM(created_at >= ?),0) AS week,
      COALESCE(SUM(created_at >= ?),0) AS month
      FROM pageviews WHERE ${PUBLIC} AND created_at < ?`, args: [today, day(-6), day(-29), day(1)]},
    {sql: `SELECT substr(created_at,1,10) AS day, COUNT(*) AS views FROM pageviews
      WHERE ${PUBLIC} AND created_at >= ? AND created_at < ? GROUP BY day ORDER BY day`, args: [day(-29), day(1)]},
    {sql: `SELECT CASE WHEN instr(path,'?') > 0 THEN substr(path,1,instr(path,'?')-1) ELSE path END AS page,
      COUNT(*) AS views FROM pageviews WHERE ${PUBLIC} AND created_at >= ? AND created_at < ?
      GROUP BY page ORDER BY views DESC, page LIMIT 10`, args: [day(-29), day(1)]}
  ], 'read');
  const counts = Object.fromEntries(Object.entries(results[0].rows[0]).map(([key,value]) => [key,Number(value)]));
  const daily = new Map(results[1].rows.map(row => [row.day,Number(row.views)]));
  return {counts, days: Array.from({length:30},(_,i)=>({day:day(i-29),views:daily.get(day(i-29)) || 0})), pages:results[2].rows, today};
}

function render(data) {
  const number = value => Number(value).toLocaleString('en-US');
  const max = Math.max(1,...data.days.map(row=>row.views));
  return `<div class="welcome-row"><div><p class="portal-kicker">YOUR WEBSITE AT A GLANCE</p><h1>Site visits</h1><p>See which pages people are opening on ahernai.com.</p></div><a class="portal-button" href="/portal/visits">Refresh</a></div>
    <p class="setting-note">Page views, not unique visitors. Repeat loads count again. Dates use UTC; 7- and 30-day totals include today (${h(data.today)}).</p>
    <div class="visit-cards">${[['today','Today'],['week','Last 7 days'],['month','Last 30 days'],['total','All recorded history']].map(([key,label])=>`<section class="visit-card"><h2>${label}</h2><p>${number(data.counts[key])}</p></section>`).join('')}</div>
    ${data.counts.total === 0 ? '<p class="visit-empty">No public page views recorded yet. Counts will appear here as the website receives traffic.</p>' : ''}
    <section class="visit-panel"><h2>Daily page views</h2><p class="setting-note">Last 30 days · UTC</p><div class="visit-chart" role="img" aria-label="Daily page views for the last 30 days. Exact counts are in the table below.">${data.days.map(row=>`<div class="visit-bar" title="${h(row.day)}: ${number(row.views)}" style="--bar-height:${row.views/max*100}%"><span></span></div>`).join('')}</div><div class="visit-axis"><span>${h(data.days[0].day)}</span><span>${h(data.today)}</span></div><details><summary>View daily counts</summary><table class="visit-table"><caption>Daily page views (UTC)</caption><thead><tr><th scope="col">Date</th><th scope="col">Views</th></tr></thead><tbody>${[...data.days].reverse().map(row=>`<tr><th scope="row">${h(row.day)}</th><td>${number(row.views)}</td></tr>`).join('')}</tbody></table></details></section>
    <section class="visit-panel"><h2>Most viewed pages</h2><p class="setting-note">Last 30 days · up to 10 pages</p>${data.pages.length ? `<table class="visit-table"><thead><tr><th scope="col">Page</th><th scope="col">Views</th></tr></thead><tbody>${data.pages.map(row=>`<tr><th scope="row">${h(row.page)}</th><td>${number(row.views)}</td></tr>`).join('')}</tbody></table>` : '<p>No page views in this period.</p>'}</section>
    <p class="setting-note">Uses the existing first-party page-view records. No visitor IDs or analytics cookies. Private portal pages are excluded. Blocked scripts can miss views, and automated traffic can be included.</p>`;
}

function install(router, {shell, database}) {
  router.get('/portal/visits', async (req,res) => {
    if (req.portalUser.role !== 'owner') return res.status(403).send(shell({...req.portalUser,content:'<h1>Owner access required.</h1><p>Site visit reports are available to the website owner.</p>'}));
    try {
      const data = await database.withClient(report);
      res.send(shell({...req.portalUser,view:'visits',content:render(data)}));
    } catch {
      res.status(503).send(shell({...req.portalUser,view:'visits',content:'<h1>Site visits are temporarily unavailable.</h1><p>The analytics database could not be read. This does not mean there were zero visits.</p><a class="portal-button" href="/portal/visits">Try again</a>'}));
    }
  });
}
module.exports = {report,render,install};
