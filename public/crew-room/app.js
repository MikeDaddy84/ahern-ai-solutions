'use strict';
const byId=id=>document.getElementById(id);
const csrf=document.querySelector('meta[name="crew-room-csrf"]').content;
let newest=0,oldest=0,query='',pending=null,loading=false;
const known=new Set();
async function api(path,body) {
  const r=await fetch('/api/portal/crew-room'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},body:body?JSON.stringify(body):undefined});
  if(r.status===401){location.assign('/login');throw new Error('Please sign in again.');}
  if(r.status===403)throw new Error('Owner access is required. Reload the page if your session changed.');
  const data=await r.json();
  if(!r.ok)throw new Error(data.error || 'The register is unavailable.');
  return data;
}
function messageElement(m) {
  const article=document.createElement('article');article.dataset.seq=m.seq;
  const meta=document.createElement('div');meta.className='message-meta';
  const name=document.createElement('strong');name.textContent=m.sender;
  const detail=document.createElement('span');detail.textContent='→ '+m.recipient+' · '+m.thread+' · '+new Date(m.created*1000).toLocaleString()+' · #'+m.seq;
  const body=document.createElement('p');body.textContent=m.text;
  meta.append(name,detail);article.append(meta,body);return article;
}
async function load(mode='new') {
  if(loading)return;
  loading=true;
  try {
    const search=new URLSearchParams({limit:'50',q:query});
    if(mode==='new' && newest)search.set('after',newest);
    if(mode==='older' && oldest)search.set('before',oldest);
    const value=await api('/messages?'+search);
    const list=byId('messages'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<90;
    if(mode==='reset'){known.clear();list.replaceChildren();newest=0;oldest=0;}
    if(value.messages.length)list.querySelector('.empty')?.remove();
    const fragment=document.createDocumentFragment();
    for(const m of value.messages){
      if(known.has(m.seq))continue;
      known.add(m.seq);fragment.append(messageElement(m));
      newest=Math.max(newest,m.seq);oldest=oldest?Math.min(oldest,m.seq):m.seq;
    }
    if(mode==='older'){
      const height=list.scrollHeight;list.prepend(fragment);list.scrollTop+=list.scrollHeight-height;
    } else {list.append(fragment);if(nearBottom || mode==='reset')list.scrollTop=list.scrollHeight;}
    if(mode!=='new' || !oldest)byId('older').hidden=!value.has_more;
    if(!known.size){const empty=document.createElement('p');empty.className='empty';empty.textContent=query?'No messages match this search.':'The conversation starts here. Your messages are saved to your private workspace.';list.replaceChildren(empty);}
    byId('mode').textContent='PRIVATE · SYNCED';
  } finally {loading=false;}
}
byId('composer').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  const value={recipient:byId('recipient').value,thread:byId('thread').value,text:byId('message').value};
  if(!pending || JSON.stringify(pending.value)!==JSON.stringify(value))pending={value,key:crypto.randomUUID()};
  try {
    await api('/messages',{...value,request_key:pending.key});pending=null;
    byId('message').value='';byId('status').textContent='Saved to your workspace. Agent replies aren’t connected yet.';
    query='';byId('search').value='';await load('reset');
  } catch(error){byId('status').textContent=error.message+' Your text is still here; retrying will not duplicate a saved message.';}
  finally {button.disabled=false;}
});
byId('find').addEventListener('click',async()=>{if(loading)return;query=byId('search').value;try{await load('reset');}catch(e){byId('status').textContent=e.message;}});
byId('search').addEventListener('keydown',e=>{if(e.key==='Enter')byId('find').click();});
byId('older').addEventListener('click',async()=>{try{await load('older');}catch(e){byId('status').textContent=e.message;}});
async function refresh(){if(document.hidden || query || loading)return;try{await load('new');}catch(e){byId('mode').textContent='SYNC PAUSED';byId('status').textContent=e.message;}}
async function start(){
  try {
    const me=await api('/me');
    byId('owner-name').textContent=me.name;byId('owner-initial').textContent=me.name.slice(0,1).toUpperCase();
    for(const actor of me.roster.filter(x=>x!=='room')){const option=document.createElement('option');option.value=actor;option.textContent=actor+' · use live room';option.disabled=true;byId('recipient').append(option);}
    await load('reset');setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  }catch(e){byId('status').textContent=e.message;}
}
start();

bindComposerKeys(byId('composer'),byId('message'));
