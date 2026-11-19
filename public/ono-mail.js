(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const root = el('ono-mail'), status = el('mail-status'), reader = el('reader'), composer = el('composer');
  const state = {folders:[], folder:'INBOX', term:'', next:null, validity:null, selected:null, message:null, draft:null};
  let busy = false;
  const make = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  function button(text, action) {
    const b = make('button',text);
    b.type = 'button';
    b.addEventListener('click',() => run(action));
    return b;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy','true');
    root.inert = true;
    status.textContent = 'Working…';
    try {
      const notice = await action();
      status.textContent = typeof notice === 'string' ? notice : '';
    } catch (error) {
      status.textContent = error.message || 'The mailbox is unavailable.';
    } finally {
      busy = false;
      root.inert = false;
      root.setAttribute('aria-busy','false');
    }
  }
  async function api(action, fields={}) {
    const response = await fetch('/api/portal/ono-sendai/mail', {
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',
      'X-CSRF-Token':el('main').dataset.csrf},body:JSON.stringify({action,...fields})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || 'Could not reach Ono-Sendai. Refresh and try again.');
    return data;
  }
  function leaveDraft() {
    if (state.draft && !window.confirm('Discard this unfinished message?')) return false;
    state.draft = null;
    composer.hidden = true;
    reader.hidden = false;
    return true;
  }
  function clearReader() {
    state.message = null;
    state.selected = null;
    reader.replaceChildren(make('p','Select a message to read it.'));
  }
  async function folders() {
    const data = await api('folders');
    state.folders = data.folders;
    el('mail-address').textContent = data.address;
    el('folder-list').replaceChildren(...data.folders.map(f=>{
      const item = button(f.name,async()=>{
        if (!leaveDraft()) return;
        state.folder=f.id;
        state.term='';
        el('search-term').value='';
        await list();
      });
      item.dataset.folder = f.id;
      return item;
    }));
  }
  function shortDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  }
  async function list(older=false) {
    const data = await api('list',{folder:state.folder,search:state.term,before:older?state.next:null});
    if (older && state.validity !== data.validity) return list();
    state.validity = data.validity;
    state.next = data.next;
    const name = state.folders.find(f=>f.id===state.folder)?.name || state.folder;
    el('folder-title').textContent = name;
    for (const item of el('folder-list').children) item.setAttribute('aria-pressed',String(item.dataset.folder===state.folder));
    const items = el('message-list');
    if (!older) {items.replaceChildren();clearReader();}
    for (const msg of data.messages) {
      const item = button('',async()=>{
        if (!leaveDraft()) return;
        const ref = {folder:state.folder,validity:state.validity,uid:msg.uid};
        const content = await api('read',ref);
        state.selected = {...ref,unread:msg.unread};
        state.message = content;
        for (const row of items.querySelectorAll('button')) row.setAttribute('aria-pressed',String(row===item));
        renderReader();
        if (window.matchMedia('(max-width: 850px)').matches) reader.scrollIntoView({block:'start'});
      });
      item.className='mail-row'+(msg.unread?' is-unread':'');
      item.append(make('span',msg.sender || '(Unknown sender)'),make('small',shortDate(msg.date)),
        make('strong',msg.subject || '(No subject)'));
      items.append(item);
    }
    if (!items.children.length) items.append(make('p',state.term?'No matching messages.':'This folder is empty.'));
    el('mail-more').hidden = !state.next;
  }
  function renderReader() {
    const message=state.message, ref=state.selected, h=message.headers;
    const tools=make('div',null,'mail-actions');
    for (const [label,kind] of [['Reply','reply'],['Reply all','replyAll'],['Forward','forward']]) {
      tools.append(button(label,()=>compose(kind)));
    }
    tools.append(button(ref.unread?'Mark read':'Mark unread',async()=>{
      await api('seen',{...ref,seen:ref.unread});
      await list(); return 'Read status updated.';
    }));
    const dest=make('select');
    dest.setAttribute('aria-label','Destination folder');
    dest.append(new Option('Move to folder…',''),...state.folders.filter(f=>f.id!==state.folder).map(f=>new Option(f.name,f.id)));
    tools.append(dest,button('Move',async()=>{
      if (!dest.value) throw new Error('Choose a destination folder.');
      await api('move',{...ref,destination:dest.value});
      await list(); return 'Message moved in Gmail.';
    }));
    reader.replaceChildren(make('h2',h.Subject || '(No subject)'),make('p',h.From,'mail-from'),
      make('p','To: '+h.To+(h.Cc?' · Cc: '+h.Cc:''),'mail-detail'),make('p',h.Date,'mail-detail'),
      tools,make('pre',message.body || '(No text body)','mail-body'));
    if(message.truncated) reader.append(make('p','Showing the first 96,000 characters.'));
    if(message.attachments.length) reader.append(make('p','Attachments: '+message.attachments.join(', ')));
  }
  function compose(kind) {
    if (!leaveDraft()) return;
    const msg=state.message, h=msg?.headers;
    const title={new:'New message',reply:'Reply',replyAll:'Reply all',forward:'Forward'}[kind];
    state.draft = {kind,sendId:crypto.randomUUID(),...(kind==='new'?{}:state.selected)};
    el('compose-title').textContent = title;
    el('compose-to').value = kind.startsWith('reply')?msg.replyTo:'';
    el('compose-cc').value = kind==='replyAll'?msg.replyCc:'';
    el('compose-subject').value = kind==='new'?'':kind==='forward'?'Fwd: '+(h.Subject || ''):
      (/^re:/i.test(h.Subject)?h.Subject:'Re: '+(h.Subject || ''));
    el('compose-body').value = '';
    const note=el('compose-note');
    note.hidden = kind!=='forward';
    note.textContent = 'The original message and its attachments will be forwarded as an email attachment.';
    composer.hidden=false; reader.hidden=true;
    requestAnimationFrame(()=>el(kind.startsWith('reply')?'compose-body':'compose-to').focus());
  }
  function submit(id,fn) {
    el(id).addEventListener('submit',e=>{e.preventDefault();run(fn);});
  }
  el('mail-new').addEventListener('click',()=>run(()=>compose('new')));
  el('compose-close').addEventListener('click',leaveDraft);
  el('mail-more').addEventListener('click',()=>run(()=>list(true)));
  submit('mail-search',async()=>{if (!leaveDraft()) return;state.term=el('search-term').value.trim();await list();});
  submit('folder-create',async()=>{
    const name=el('folder-name').value.trim();
    await api('create',{name});el('folder-name').value='';await folders();
    for (const item of el('folder-list').children) item.setAttribute('aria-pressed',String(item.dataset.folder===state.folder));
    return 'Folder created in Gmail.';
  });
  submit('composer',async()=>{
    const draft=state.draft;
    if (!draft) return;
    await api('send',{...draft,to:el('compose-to').value.trim(),cc:el('compose-cc').value.trim(),
      subject:el('compose-subject').value,body:el('compose-body').value});
    state.draft=null;composer.reset();composer.hidden=true;reader.hidden=false;
    return 'Message sent.';
  });
  window.addEventListener('beforeunload',e=>{if(state.draft){e.preventDefault();e.returnValue='';}});
  run(async()=>{await folders();await list();});
})();