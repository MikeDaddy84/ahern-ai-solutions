(() => {
  const grid = document.getElementById('overview-grid');
  if (!grid) return;
  const external = {
    relay: { origin: 'https://hosaka.ahernai.com', path: '/relay/overview-widget', name: 'Relay' },
    'crew-room': { origin: 'https://crew.ahernai.com', path: '/overview-widget', name: 'Crew Room' },
  };
  const cards = new Map([...grid.querySelectorAll('[data-widget]')].map(card => [card.dataset.widget, card]));
  const bridges = new Map();
  const requests = new Map();
  const number = n => Number(n).toLocaleString('en-US');
  const node = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const shortDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  };
  function metric(body, count, label, note) {
    const box = node('div', undefined, 'overview-metric');
    box.append(node('strong', number(count)), node('span', label));
    body.append(box);
    if (note) body.append(node('p', note, 'overview-note'));
  }
  function list(body, items, empty) {
    if (!items.length) { body.append(node('p', empty, 'overview-empty')); return; }
    const ul = node('ul', undefined, 'overview-list');
    for (const item of items.slice(0, 4)) {
      const li = node('li');
      if (item.label) li.append(node('span', item.label, 'overview-item-label' + (item.overdue ? ' is-overdue' : '')));
      if (item.title) li.append(node('strong', item.title));
      if (item.text) li.append(node('p', item.text));
      if (item.meta) li.append(node('small', item.meta));
      ul.append(li);
    }
    body.append(ul);
  }
  function renderVisits(body, data) {
    metric(body, data.counts.month, 'page views · last 30 days');
    const stats = node('div', undefined, 'overview-mini-stats');
    stats.append(node('span', `${number(data.counts.today)} today`), node('span', `${number(data.counts.week)} in 7 days`));
    body.append(stats);
    const chart = node('div', undefined, 'overview-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'Daily page views over the last 30 days. Exact values are available in Daily counts below.');
    const max = Math.max(1, ...data.days.map(day => day.views));
    for (const day of data.days) {
      const bar = node('span');
      bar.style.setProperty('--view-height', `${day.views / max * 100}%`);
      bar.title = `${day.day}: ${number(day.views)} page views`;
      bar.append(node('i'));
      chart.append(bar);
    }
    body.append(chart);
    const axis = node('div', undefined, 'overview-axis');
    axis.append(node('span', data.days[0]?.day), node('span', data.today));
    body.append(axis, node('p', 'Page views · UTC dates · repeat loads count again.', 'overview-note'));
    const details = node('details', undefined, 'overview-daily');
    details.append(node('summary', 'Daily counts'));
    const table = node('table');
    table.append(node('caption', 'Daily page views (UTC)'));
    const head = node('thead'), heading = node('tr');
    for (const label of ['Date', 'Views']) { const th = node('th', label); th.scope = 'col'; heading.append(th); }
    head.append(heading); table.append(head);
    const tbody = node('tbody');
    for (const day of [...data.days].reverse()) { const tr = node('tr'); const th = node('th', day.day); th.scope = 'row'; tr.append(th, node('td', number(day.views))); tbody.append(tr); }
    table.append(tbody); details.append(table); body.append(details);
  }
  function renderSatori(body, data) {
    metric(body, data.counts.remaining, 'Have Tos remaining', `${number(data.counts.done)} of ${number(data.counts.total)} complete · ${data.dayKey} · Central`);
    const progress = node('progress'); progress.max = Math.max(1, data.counts.total); progress.value = data.counts.done; progress.setAttribute('aria-label', 'Have Tos completed'); body.append(progress);
    list(body, data.tasks.map(task => ({ text: task.text })), data.counts.total ? 'Today’s Have Tos are complete.' : 'No Have Tos on today’s agenda.');
    if (data.tasks.length > 4) body.append(node('p', `+${number(data.tasks.length - 4)} more in Satori`, 'overview-note'));
  }
  function renderCalls(body, data) {
    metric(body, data.counts.actionable, 'items needing attention');
    const stats = node('div', undefined, 'overview-queue-stats');
    for (const [count, label] of [[data.counts.openQuestions, 'find-outs'], [data.counts.answeredQuestions, 'answers to relay'], [data.counts.unconfirmedConsults, 'consults to confirm']]) stats.append(node('span', `${number(count)} ${label}`));
    body.append(stats);
    const items = [
      ...data.openQuestions.map(item => ({ label: item.overdue ? 'Overdue find-out' : 'Find-out', overdue: item.overdue, title: item.business || item.contact, text: item.text, meta: `Due ${shortDate(item.dueBy)} Central` })),
      ...data.answeredQuestions.map(item => ({ label: 'Answer ready to relay', title: item.business || item.contact, text: item.text })),
      ...data.unconfirmedConsults.map(item => ({ label: 'Confirm consult', title: item.business || item.contact, text: item.consultLabel || item.consultAt.replace('T', ' ') + ' Central' })),
    ];
    list(body, items, 'No open find-outs, answers awaiting relay, or consults awaiting confirmation.');
  }
  function renderRelay(body, data) {
    metric(body, data.counts.replies, `recorded replies · last ${data.periodDays} days`);
    list(body, data.replies.map(item => ({ title: item.business || 'Prospect reply', text: item.summary, meta: shortDate(item.at) + ' Central' })), 'No replies recorded in this period.');
    body.append(node('p', data.lastSyncAt ? `Gmail last synced ${shortDate(data.lastSyncAt)} Central.` : 'Gmail has not synced yet.', 'overview-note'));
    if (data.syncError) body.append(node('p', 'Gmail sync needs attention. Open Relay to reconnect.', 'overview-warning'));
  }
  function renderCrew(body, data) {
    metric(body, data.counts.recentMessages, `crew messages · last ${data.periodDays} days`);
    list(body, data.messages.map(item => ({ title: item.author, text: item.text, meta: shortDate(item.createdAt) + ' Central' })), 'No crew messages in this period.');
    body.append(node('p', 'Recent room messages. Direct messages stay in Crew Room.', 'overview-note'));
  }
  const renderers = { visits: renderVisits, satori: renderSatori, 'call-desk': renderCalls, relay: renderRelay, 'crew-room': renderCrew };
  function validSummary(id, data) {
    const keys = { visits: ['today', 'week', 'month', 'total'], satori: ['total', 'done', 'remaining'], 'call-desk': ['actionable', 'openQuestions', 'overdueQuestions', 'answeredQuestions', 'unconfirmedConsults'], relay: ['replies'], 'crew-room': ['recentMessages'] };
    const count = value => Number.isSafeInteger(value) && value >= 0;
    if (!data || !data.counts || !keys[id].every(key => count(data.counts[key])) || Number.isNaN(Date.parse(data.updatedAt))) return false;
    if (id === 'visits') return Array.isArray(data.days) && data.days.length === 30 && data.days.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day.day) && count(day.views));
    if (id === 'satori') return Array.isArray(data.tasks) && data.tasks.every(task => typeof task.text === 'string') && data.counts.done + data.counts.remaining === data.counts.total;
    if (id === 'call-desk') return ['openQuestions', 'answeredQuestions', 'unconfirmedConsults'].every(key => Array.isArray(data[key]));
    if (id === 'relay') return Array.isArray(data.replies) && data.periodDays === 7;
    return Array.isArray(data.messages) && data.periodDays === 7;
  }
  function finish(card, label, state) {
    card.setAttribute('aria-busy', 'false');
    card.dataset.state = state;
    card.querySelector('.overview-state').textContent = label;
  }
  function ready(id, data) {
    if (!validSummary(id, data)) throw new Error('This tool returned an incomplete summary. Please retry.');
    const card = cards.get(id);
    const body = node('div', undefined, 'overview-body');
    // Build detached, so malformed data cannot replace a complete widget with a partial view.
    renderers[id](body, data);
    card.querySelector('.overview-body').replaceWith(body);
    card.querySelector('.overview-retry').hidden = true;
    card.querySelector('.overview-updated').textContent = grid.dataset.sample === 'true' ? 'Sample data' : `Updated ${shortDate(data.updatedAt)} Central`;
    finish(card, grid.dataset.sample === 'true' ? 'Preview' : 'Connected', 'ready');
  }
  function unavailable(id, message, label = 'Unavailable') {
    const card = cards.get(id);
    card.querySelector('.overview-body').replaceChildren(node('p', message, 'overview-empty'));
    card.querySelector('.overview-updated').textContent = '';
    card.querySelector('.overview-retry').hidden = false;
    finish(card, label, 'unavailable');
  }
  function start(id) {
    const card = cards.get(id);
    card.setAttribute('aria-busy', 'true');
    card.querySelector('.overview-state').textContent = 'Refreshing';
    card.querySelector('.overview-retry').hidden = true;
  }
  async function loadLocal(id) {
    requests.get(id)?.abort();
    const controller = new AbortController(); requests.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`/api/portal/overview/${id}`, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      if (requests.get(id) !== controller) return;
      if (response.status === 401) { unavailable(id, 'Your portal session ended. Sign in again to load this tool.', 'Sign in'); return; }
      const data = await response.json();
      if (requests.get(id) !== controller) return;
      if (!response.ok || data.status !== 'ready') throw new Error(data.message || 'This summary could not be loaded. Please try again.');
      ready(id, data);
    } catch (error) {
      if (requests.get(id) === controller) unavailable(id, error.name === 'AbortError' ? 'This tool is taking too long to respond. Please retry.' : error.message);
    } finally { clearTimeout(timer); }
  }
  function loadExternal(id) {
    const previous = bridges.get(id);
    if (previous) { clearTimeout(previous.timer); previous.frame.remove(); }
    const connection = external[id];
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = `${connection.name} summary connection`;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => unavailable(id, `Open ${connection.name} and sign in, then refresh this widget. Its live summary is not available yet.`, 'Open tool'), 15000);
    bridges.set(id, { frame, timer });
    frame.src = connection.origin + connection.path;
    cards.get(id).append(frame);
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'ahernai:overview' || !Object.hasOwn(external, message.widget)) return;
    const id = message.widget, bridge = bridges.get(id);
    if (!bridge || event.origin !== external[id].origin || event.source !== bridge.frame.contentWindow) return;
    clearTimeout(bridge.timer);
    try {
      if (message.data?.status !== 'ready') throw new Error('Summary unavailable');
      ready(id, message.data);
    } catch { unavailable(id, `The ${external[id].name} summary could not be loaded. Open the tool or try again.`); }
  });
  function load(id) {
    start(id);
    if (grid.dataset.sample === 'true') {
      ready(id, { updatedAt: new Date().toISOString(), dayKey: 'Sample day', counts: { total: 3, done: 1, remaining: 2 }, tasks: [{ text: 'Prepare for your morning meeting' }, { text: 'Follow up on this week’s priorities' }] });
      return;
    }
    if (external[id]) loadExternal(id); else loadLocal(id);
  }
  for (const [id, card] of cards) { card.querySelector('.overview-retry').addEventListener('click', () => load(id)); load(id); }
  document.getElementById('overview-refresh').addEventListener('click', () => { for (const id of cards.keys()) load(id); });
})();
