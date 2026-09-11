const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
const { randomUUID } = require('node:crypto');
const workers = new Map();
const MAX_ACTIVE = 4;
function configuration(key) {
  if(!/^[a-z0-9_-]{1,64}$/.test(key || '')) throw new Error('Invalid workspace key');
  const shared=require('./portal-db').configuration();
  if(!shared) throw new Error('Satori database is not configured');
  const calendars=JSON.parse(process.env.SATORI_WORKSPACE_CALENDARS_JSON || '{}');
  const own=Object.hasOwn(calendars,key) ? calendars[key] : {};
  for(const calendar of [own.calendarUrl,own.familyCalendarUrl].filter(Boolean)) {
    if(new URL(calendar).protocol!=='https:') throw new Error('Calendar URLs must use HTTPS');
  }
  return {...shared,workspaceKey:key,calendarUrl:own.calendarUrl || '',familyCalendarUrl:own.familyCalendarUrl || ''};
}
function stop(key, entry) {
  clearTimeout(entry.idle);
  if(workers.get(key)===entry) workers.delete(key);
  for(const pending of entry.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Satori unavailable')); }
  entry.pending.clear();
  entry.worker.terminate();
}
async function request(key, method, url, body) {
  let entry=workers.get(key);
  if(!entry) {
    const config=configuration(key);
    if(workers.size>=MAX_ACTIVE) {
      const idle=[...workers.entries()].find(([,value])=>value.pending.size===0);
      if(!idle) throw new Error('Satori busy');
      stop(...idle);
    }
    const worker=new Worker(path.join(__dirname,'../apps/satori/portal-worker.mjs'),{workerData:config,env:{NODE_ENV:process.env.NODE_ENV || 'development',TZ:'UTC',SATORI_WORKSPACE_KEY:config.workspaceKey,CALENDAR_ICS_URL:config.calendarUrl || '',FAMILY_CALENDAR_ICS_URL:config.familyCalendarUrl || ''},stdout:true,stderr:true});
    worker.stdout.resume(); worker.stderr.resume();
    entry={worker,pending:new Map(),idle:null};
    workers.set(key,entry);
    entry.ready=new Promise((resolve,reject)=> {
      const timer=setTimeout(()=> { reject(new Error('Satori startup timed out')); stop(key,entry); },30000);
      worker.on('message',message=> {
        if(message.ready) { clearTimeout(timer); resolve(); return; }
        const pending=entry.pending.get(message.id);
        if(pending) { clearTimeout(pending.timer); entry.pending.delete(message.id); pending.resolve(message); }
      });
      worker.once('error',()=> {clearTimeout(timer);reject(new Error('Satori startup failed'));stop(key,entry);});
      worker.once('exit',()=> {clearTimeout(timer);reject(new Error('Satori stopped'));stop(key,entry);});
    });
    // Attach immediately; simultaneous requests await the same initialization.
    entry.ready.catch(()=>{});
  }
  clearTimeout(entry.idle);
  await entry.ready;
  try {
    return await new Promise((resolve,reject)=> {
      const id=randomUUID();
      const timer=setTimeout(()=> {reject(new Error('Satori request timed out'));stop(key,entry);},45000);
      entry.pending.set(id,{resolve,reject,timer});
      entry.worker.postMessage({id,method,url,body});
    });
  } finally {
    if(entry.pending.size===0) { clearTimeout(entry.idle);entry.idle=setTimeout(()=>stop(key,entry),5*60*1000);entry.idle.unref(); }
  }
}
function clientHtml() { return fs.readFileSync(path.join(__dirname,'../apps/satori/dist/public/index.html'),'utf8'); }
function close() { for(const [key,entry] of workers) stop(key,entry); }
module.exports = { request, configuration, clientHtml, close };
