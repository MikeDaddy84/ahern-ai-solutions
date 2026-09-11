import type { TaskItem } from './api.js';
// Deliberately isolated sample data. This adapter never sends a network request.
const storageKey = 'ahern-satori-preview-v1';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Chicago', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
function initial(): TaskItem[] {
  return [
    ['Review tomorrow’s meeting agenda','have_to','today'],
    ['Send the project update','have_to','today'],
    ['Map out next week’s priorities','need_to','today'],
    ['Spend 20 minutes learning something new','want_to','today'],
    ['Organize project notes','need_to','backlog']
  ].map(([text,type,status],i)=>({id:`sample-${i}`,text,type,status,dateAdded:Date.now(),dayKey:status==='today'?dayKey:null,sortOrder:i,source:'manual'} as TaskItem));
}
let tasks = initial();
try { const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null'); if(Array.isArray(saved) && saved.every(t=>typeof t.text==='string' && typeof t.id==='string')) tasks=saved; } catch {}
function save() { try { sessionStorage.setItem(storageKey,JSON.stringify(tasks)); } catch {} }
export async function previewRequest(url: string, options: RequestInit = {}): Promise<unknown> {
  const parsed=new URL(url,'https://preview.invalid');
  const method=options.method || 'GET';
  const body=options.body ? JSON.parse(String(options.body)) : {};
  if(parsed.pathname==='/api/me') return {authenticated:true};
  if(parsed.pathname==='/api/logout') return {success:true};
  if(parsed.pathname==='/api/calendar') return {days:{},sources:[],errors:{}};
  if(parsed.pathname==='/api/history') return [];
  if(parsed.pathname==='/api/rollover') throw new Error('Daily rollover runs in a connected workspace. This preview only changes sample tasks.');
  if(parsed.pathname==='/api/backlog') return tasks.filter(t=>t.status==='backlog');
  if(parsed.pathname==='/api/today') {
    const categories:any={}; const counts:any={};
    for(const type of ['have_to','need_to','want_to']) { categories[type]=tasks.filter(t=>t.type===type && ['today','done'].includes(t.status)); counts[type]={total:categories[type].length,remaining:categories[type].filter((t:TaskItem)=>t.status!=='done').length}; }
    return {dayKey,categories,counts};
  }
  if(parsed.pathname==='/api/tasks' && method==='POST') {
    const task:TaskItem={id:crypto.randomUUID(),text:body.text.trim(),type:body.type,status:body.target==='backlog'?'backlog':'today',source:body.source||'manual',dateAdded:Date.now(),dayKey,sortOrder:Date.now()};
    tasks.push(task);save();return task;
  }
  const id=parsed.pathname.split('/').pop();
  const task=tasks.find(t=>t.id===id);
  if(!task) throw new Error('Sample task not found.');
  if(method==='DELETE') { tasks=tasks.filter(t=>t.id!==id);save();return {success:true}; }
  if(method==='PATCH') { Object.assign(task,body);save();return task; }
  throw new Error('This action is not available in the preview.');
}
