const crypto = require('node:crypto');
const { escapeHtml: e } = require('./layout');
const { STAGES } = require('./leads');
const key = crypto.randomBytes(32);
function token(id) { return crypto.createHmac('sha256', key).update(String(id)).digest('hex'); }
function validToken(id, value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && crypto.timingSafeEqual(Buffer.from(token(id),'hex'),Buffer.from(value,'hex')); }
function form(row) {
  const input=(key,label)=>`<label class="plan-field"><span>${label}</span><input type="number" min="0" max="${key==='delivery_hours'?100000:10000000}" step="0.01" name="${key}" value="${row[key]==null?'':e(String(row[key]))}"></label>`;
  return `<form method="post" action="/leads/${Number(row.id)}/stage" class="lead-edit"><input type="hidden" name="csrf" value="${token(row.id)}">
    <label class="plan-field"><span>Stage</span><select name="stage">${STAGES.map(s=>`<option value="${s}"${s===row.stage?' selected':''}>${s}</option>`).join('')}</select></label>
    ${input('revenue','Total sale ($)')}${input('direct_cost','Direct costs, including parts ($)')}${input('delivery_hours','Delivery hours')}
    <label class="plan-field"><span>Outcome / loss reason</span><input name="outcome_note" maxlength="600" value="${e(row.outcome_note)}"></label><button class="btn btn-primary" type="submit">Save inquiry status</button></form>
    ${row.revenue!=null&&row.direct_cost!=null?`<p>Sale less direct costs: $${(row.revenue-row.direct_cost).toFixed(2)}. Before labor, overhead, and tax.</p>`:''}`;
}
function summary(rows,events) {
  const counts=STAGES.map(s=>`${s}: ${rows.filter(r=>r.stage===s).length}`).join(' · ');
  const eventText=events.map(r=>`<li>${e(r.service)} · ${e(r.event.replace(/_/g,' '))}: ${Number(r.count)}</li>`).join('');
  return `<p>Stages among the latest ${rows.length} inquiries: ${counts}.</p><details><summary>Site activity · last 30 days</summary><p>Anonymous browser events, not unique visitors. Blocking, repeat visits, and incomplete sessions affect counts. Use saved inquiries and stage records to assess sales.</p><ul>${eventText||'<li>No events recorded yet.</li>'}</ul></details>`;
}
module.exports={token,validToken,form,summary};
