const {escapeHtml: h} = require('./layout');

function accountList(accounts) {
  const cards = accounts.map(a=>{
    const label = a.address || 'Primary mailbox';
    const provider = {gmail:'Gmail',yahoo:'Yahoo Mail',imap:'IMAP'}[a.provider] || 'Mail';
    const count = a.unread===null ? (a.state==='error'?'Sync unavailable':'Awaiting sync') : a.unread.toLocaleString('en-US')+' unread';
    const href = '/portal/ono-sendai/account/'+encodeURIComponent(a.id);
    return '<a class="mail-account-card" href="'+href+'"><span class="account-provider">'+h(provider)+'</span><strong>'+h(label)+'</strong><span class="account-count">'+h(count)+'</span><span class="account-arrow" aria-hidden="true">→</span></a>';
  }).join('');
  return '<link rel="stylesheet" href="/ono-mail.css"><section class="ono-mail mail-accounts"><h1>Ono-Sendai</h1><header class="account-list-head"><h2>Mail accounts</h2><a class="account-add" href="/portal/ono-sendai/add-account">Add Account</a></header><div class="mail-account-grid">'+
    (cards || '<p>No connected mailboxes yet.</p>')+'</div><a class="mail-connection" href="/portal/ono-sendai/setup">Manage mailbox connection</a></section>';
}

function readOnly(account) {
  const rows = account.messages.map(m=>'<li><strong>'+h((m.important?'★ ':'')+(m.subject || '(No subject)'))+'</strong><p>'+h(m.sender)+'</p><small>'+h(m.received)+'</small></li>').join('');
  return '<a href="/portal/ono-sendai">← All accounts</a><h1>'+h(account.address || 'Primary mailbox')+
    '</h1><section class="overview-card"><h2>Recent inbox mail</h2><p>'+
    (account.unread===null?'Count unavailable':account.unread+' unread · Last synced '+h(account.lastSync))+
    '</p><ul class="overview-list">'+rows+'</ul></section><a href="/portal/ono-sendai/setup">Manage mailbox connection</a>';
}

function workspace(account) {
  return `<link rel="stylesheet" href="/ono-mail.css"><div class="ono-mail" id="ono-mail" data-account="${h(account.id)}"><a class="mail-back" href="/portal/ono-sendai">← All accounts</a>
  <header class="mail-head"><div><h1>Ono-Sendai</h1><span id="mail-address">${h(account.address)}</span></div><button id="mail-new" type="button">New message</button></header>
  <p id="mail-status" role="status" aria-live="polite">Connecting to mailbox…</p>
  <div class="mail-columns">
    <aside class="mail-folders" aria-label="Mail folders"><h2>Folders</h2><form id="folder-create"><label for="folder-name">New folder</label><div><input id="folder-name" required maxlength="180"><button>Add</button></div></form><div id="folder-list"></div></aside>
    <section class="mail-list" aria-labelledby="folder-title"><h2 id="folder-title">Inbox</h2><form id="mail-search"><label for="search-term">Search folder</label><div><input id="search-term" type="search" maxlength="200"><button>Search</button></div></form><div id="message-list"></div><button id="mail-more" hidden>Load older messages</button></section>
    <section class="mail-reader" aria-label="Reading pane"><div id="reader"><p>Select a message to read it.</p></div>
    <form id="composer" hidden><h2 id="compose-title">New message</h2><label>To<input id="compose-to" required maxlength="4096"></label><label>Cc<input id="compose-cc" maxlength="4096"></label><label>Subject<input id="compose-subject" maxlength="998"></label><label>Message<textarea id="compose-body" required rows="12" maxlength="96000"></textarea></label><p id="compose-note" hidden></p><div class="mail-actions"><button type="submit">Send</button><button type="button" id="compose-close">Discard</button></div></form>
    </section></div></div><script src="/ono-mail.js?v=accounts-2" defer></script>`;
}
const setup = `<section><h2>Enable the mail client</h2><p>Enter the device fingerprint printed by Ono-Sendai to connect folders, replies, and sending to this owner account.</p><form id="ono-device-form"><label>Device fingerprint <input id="ono-device-fingerprint" required pattern="[0-9a-f]{64}" maxlength="64" autocomplete="off"></label><button type="submit" class="portal-button">Enable mail client</button></form><p id="ono-device-status" role="status"></p></section>`;
function addAccount(paired) {
  const form = paired ? `<form id="mail-enroll" method="post">
    <label for="enroll-provider">Email provider</label>
    <select id="enroll-provider"><option value="gmail">Gmail / Google Workspace</option><option value="yahoo">Yahoo Mail</option></select>
    <label for="enroll-address">Email address</label>
    <input id="enroll-address" type="email" required maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false">
    <label for="enroll-password">App password</label>
    <input id="enroll-password" type="password" required maxlength="128" autocomplete="off" aria-describedby="enroll-help">
    <p id="enroll-help">Use an app password created for Ono-Sendai. <a id="provider-help" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Open Google app passwords ↗</a></p>
    <p>Connect this mailbox to read, file, and send mail from this address.</p>
    <button id="enroll-submit" type="submit">Connect mailbox</button></form>
    <p id="enroll-status" role="status" aria-live="polite"></p><a id="enroll-open" hidden>Open mailbox →</a>
    <script defer src="/ono-enroll.js"></script>` :
    '<p>Pair your Ono-Sendai device to connect a mailbox.</p><a href="/portal/ono-sendai/setup">Pair mail device</a>';
  return '<link rel="stylesheet" href="/ono-mail.css"><section class="ono-mail mail-enrollment"><a class="mail-back" href="/portal/ono-sendai">← All accounts</a><h1>Add Account</h1>'+form+'</section>';
}
module.exports = {accountList,readOnly,workspace,setup,addAccount};
