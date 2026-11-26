(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('mail-enroll'), provider = byId('enroll-provider'), password = byId('enroll-password');
  const submit = byId('enroll-submit'), status = byId('enroll-status');
  const help = byId('provider-help');
  provider.addEventListener('change', () => {
    const yahoo = provider.value === 'yahoo';
    help.href = yahoo ? 'https://login.yahoo.com/account/security' : 'https://myaccount.google.com/apppasswords';
    help.textContent = yahoo ? 'Open Yahoo account security ↗' : 'Open Google app passwords ↗';
  });

  async function request(body) {
    const res = await fetch('/api/portal/ono-sendai/enroll', {method:'POST', cache:'no-store',
      headers:{'Content-Type':'application/json','X-CSRF-Token':byId('main').dataset.csrf},
      body:JSON.stringify(body)});
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Setup is unavailable. Refresh the page and try again.');
    return result;
  }

  async function showMailbox(id) {
    const link = byId('enroll-open');
    for (let attempt=0; attempt<40; attempt++) {
      try {
        const res = await fetch('/api/portal/overview/ono-sendai',{cache:'no-store'});
        if (res.ok && (await res.json()).accounts?.some(a=>a.id===id)) {
          link.href = '/portal/ono-sendai/account/'+encodeURIComponent(id);
          link.hidden = false;
          status.textContent = 'Mailbox connected and available in Mail accounts.';
          link.focus();
          return;
        }
      } catch { /* The next refresh can still complete. */ }
      await new Promise(resolve=>setTimeout(resolve,4000));
    }
    status.textContent = 'Mailbox connected. Check Mail accounts after the next Overview refresh.';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    const selected = provider.value, address = byId('enroll-address').value.trim();
    form.inert = true;
    status.textContent = 'Connecting to your mail device…';
    try {
      const {publicKey} = await request({action:'setupKey'});
      const algorithm = {name:'RSA-OAEP',hash:'SHA-256'};
      const key = await crypto.subtle.importKey('spki',Uint8Array.from(atob(publicKey),c=>c.charCodeAt(0)),algorithm,false,['encrypt']);
      const encoder = new TextEncoder();
      const bytes = await crypto.subtle.encrypt({name:'RSA-OAEP',label:encoder.encode(selected+':'+address)},
        key,encoder.encode(password.value));
      password.value = '';
      status.textContent = 'Checking incoming and outgoing mail…';
      const sealed = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      const {id} = await request({action:'connectAccount',provider:selected,address,sealed});
      form.hidden = true;
      status.textContent = 'Mailbox connected. Waiting for its first inbox summary…';
      await showMailbox(id);
    } catch (error) {
      form.inert = false;
      submit.disabled = false;
      status.textContent = error.message || 'Could not connect the mailbox.';
      password.focus();
    }
  });
})();
