const { escapeHtml: h } = require('./layout');

function render({ name = 'Your workspace', role = 'member', preview = false } = {}) {
  const owner = !preview && role === 'owner';
  const team = !preview && ['owner', 'employee'].includes(role);
  const base = preview ? '/portal/preview' : '/portal';
  const card = (id, title, mark, description, href, external = false) => `<section class="overview-card overview-${id}" data-widget="${id}" aria-labelledby="overview-${id}-title" aria-busy="true">
    <header class="overview-card-head"><a href="${href}" ${external ? `target="_blank" rel="noopener noreferrer" aria-label="Open ${h(title)} (opens in a new tab)"` : ''}><span class="overview-mark" aria-hidden="true">${mark}</span><h3 id="overview-${id}-title">${title}</h3><span class="overview-arrow" aria-hidden="true">${external ? '↗' : '→'}</span></a><span class="overview-state">Loading</span></header>
    <p class="overview-description">${description}</p><div class="overview-body"><p class="overview-empty">Loading your ${title === 'Satori' ? 'priorities' : 'summary'}…</p></div>
    <footer class="overview-card-foot"><span class="overview-updated" role="status"></span><button type="button" class="overview-retry" hidden>Retry</button></footer></section>`;
  return `<div class="welcome-row overview-welcome"><div><p class="portal-kicker">YOUR WORKSPACE</p><h1>Your day, in view.</h1><p>Welcome${preview ? '' : ', ' + h(name)}. Here’s what needs your attention.</p></div><div class="overview-controls"><time id="workspace-date"></time><button class="overview-refresh" id="overview-refresh" type="button">↻ Refresh</button></div></div>
    <h2 class="overview-sr-only">Your tools at a glance</h2><div id="overview-grid" class="overview-grid" data-sample="${preview}">
    ${owner ? card('visits', 'Site visits', '↗', 'A small view of your website’s traffic.', '/portal/visits') : ''}
    ${card('satori', 'Satori', '悟', 'Today’s Have Tos. One thing at a time.', base + '/satori')}
    ${team ? card('call-desk', 'Call Desk', '☎', 'Find-outs, answers to pass on, and consults to confirm.', '/portal/call-desk') : ''}
    ${owner ? card('relay', 'Relay', 'R', 'Recent responses from your outreach.', 'https://hosaka.ahernai.com/relay/', true) + card('crew-room', 'Crew Room', '⌘', 'The latest from your crew.', 'https://crew.ahernai.com/', true) : ''}
    </div><div class="overview-bottom"><p>Open any tool to pick up where you left off.</p><div>${owner ? '<a href="https://hosaka.ahernai.com/" target="_blank" rel="noopener noreferrer">Open Hosaka ↗</a>' : ''}<a href="${base}/settings">Workspace settings →</a></div></div>`;
}
module.exports = { render };
