function workspace() {
  return `<link rel="stylesheet" href="/ono-mail.css"><div class="ono-mail" id="ono-mail">
  <header class="mail-head"><div><h1>Ono-Sendai</h1><span id="mail-address"></span></div><button id="mail-new" type="button">New message</button></header>
  <p id="mail-status" role="status" aria-live="polite">Connecting to mailbox…</p>
  <div class="mail-columns">
    <aside class="mail-folders" aria-label="Mail folders"><h2>Folders</h2><form id="folder-create"><label for="folder-name">New folder</label><div><input id="folder-name" required maxlength="180"><button>Add</button></div></form><div id="folder-list"></div></aside>
    <section class="mail-list" aria-labelledby="folder-title"><h2 id="folder-title">Inbox</h2><form id="mail-search"><label for="search-term">Search folder</label><div><input id="search-term" type="search" maxlength="200"><button>Search</button></div></form><div id="message-list"></div><button id="mail-more" hidden>Load older messages</button></section>
    <section class="mail-reader" aria-label="Reading pane"><div id="reader"><p>Select a message to read it.</p></div>
    <form id="composer" hidden><h2 id="compose-title">New message</h2><label>To<input id="compose-to" required maxlength="4096"></label><label>Cc<input id="compose-cc" maxlength="4096"></label><label>Subject<input id="compose-subject" maxlength="998"></label><label>Message<textarea id="compose-body" required rows="12" maxlength="96000"></textarea></label><p id="compose-note" hidden></p><div class="mail-actions"><button type="submit">Send</button><button type="button" id="compose-close">Discard</button></div></form>
    </section></div></div><script src="/ono-mail.js" defer></script>`;
}
const setup = `<section><h2>Enable the mail client</h2><p>Enter the device fingerprint printed by Ono-Sendai to connect folders, replies, and sending to this owner account.</p><form id="ono-device-form"><label>Device fingerprint <input id="ono-device-fingerprint" required pattern="[0-9a-f]{64}" maxlength="64" autocomplete="off"></label><button type="submit" class="portal-button">Enable mail client</button></form><p id="ono-device-status" role="status"></p></section>`;
module.exports = {workspace,setup};
