const fs = require('node:fs');
const path = require('node:path');
const { escapeHtml: h } = require('./layout');
const ROSTER = ['room','morph3us','jaylene','neuromancer','trinity','3jane','hideo','kase','wintermute','the-finn','dixie','tank'];
const ROUTE = '/api/portal/crew-room';

function page(user) {
  const html = fs.readFileSync(path.join(__dirname,'../public/crew-room/index.html'),'utf8');
  return html.replace('<!-- PORTAL_SESSION -->', `<meta name="crew-room-csrf" content="${h(user.csrf)}">`);
}
function publicMessage(row) {
  return {seq:Number(row.seq),created:Number(row.created)/1000,sender:row.display_name+' (owner)',
    sender_id:row.sender_id,kind:'human',recipient:row.recipient,thread:row.thread,text:row.text};
}
function integer(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid cursor');
  return Number(value);
}
async function history(client,user,query) {
  if(Object.keys(query).some(k=>!['after','before','limit','q'].includes(k))) throw new Error('Invalid query');
  const after=integer(query.after,null),before=integer(query.before,null),limit=integer(query.limit,50);
  const search=query.q || '';
  if(after!==null && before!==null || limit<1 || limit>100 || typeof search!=='string' || search.length>200) throw new Error('Invalid query');
  const cursor=after!==null ? 'AND seq>?' : before!==null ? 'AND seq<?' : '';
  const args=[user.workspace_key,search];
  if(after!==null || before!==null) args.push(after ?? before);
  args.push(limit);
  const {rows}=await client.execute({sql:`SELECT * FROM portal_crew_messages WHERE workspace_key=? AND instr(lower(text),lower(?))>0 ${cursor} ORDER BY seq ${after!==null?'ASC':'DESC'} LIMIT ?`,args});
  return {messages:(after!==null ? rows : rows.reverse()).map(publicMessage),has_more:rows.length===limit};
}
function validate(body) {
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join(',')!=='recipient,request_key,text,thread') throw new Error('Invalid message');
  if(!ROSTER.includes(body.recipient)) throw new Error('Invalid recipient');
  for(const [key,max] of [['thread',120],['text',16000],['request_key',128]]) {
    if(typeof body[key]!=='string' || !body[key].trim() || Buffer.byteLength(body[key])>max) throw new Error('Invalid '+key);
  }
}
async function post(client,user,body) {
  validate(body);
  const tx=await client.transaction('write');
  try {
    const {rows}=await tx.execute({sql:'SELECT * FROM portal_crew_messages WHERE workspace_key=? AND sender_id=? AND request_key=?',args:[user.workspace_key,user.id,body.request_key]});
    if(rows.length) {
      if(['recipient','thread','text'].some(k=>rows[0][k]!==body[k])) {
        const error=new Error('This retry key belongs to a different message.');error.status=409;throw error;
      }
      await tx.commit();return publicMessage(rows[0]);
    }
    // Account display names cannot choose an agent identity; sender_id and kind are server-owned.
    const inserted=await tx.execute({sql:'INSERT INTO portal_crew_messages(workspace_key,created,sender_id,display_name,recipient,thread,text,request_key) VALUES(?,?,?,?,?,?,?,?) RETURNING *',args:[user.workspace_key,Date.now(),user.id,user.name,body.recipient,body.thread,body.text,body.request_key]});
    await tx.commit();return publicMessage(inserted.rows[0]);
  } catch(error) {await tx.rollback();throw error;} finally {tx.close();}
}
function install(router) {
  // Called after the existing session and CSRF middleware. Never expose the internal room to clients.
  router.use(['/portal/crew-room',ROUTE],(req,res,next)=> {
    if(req.portalUser.role!=='owner') return res.status(403).type('text').send('This workspace is for the Ahern AI owner.');
    next();
  });
  router.get('/portal/crew-room',(req,res)=>res.send(page(req.portalUser)));
  router.get(ROUTE+'/me',(req,res)=>res.json({name:req.portalUser.name,role:'owner',roster:ROSTER,agents_connected:false}));
  router.get(ROUTE+'/messages',async(req,res)=> {
    try {res.json(await history(req.portalStore.client,req.portalUser,req.query));}
    catch(error) {res.status(error.message.startsWith('Invalid')?400:503).json({error:'The register could not be loaded. Check the search and retry.'});}
  });
  router.post(ROUTE+'/messages',async(req,res)=> {
    try {res.status(201).json(await post(req.portalStore.client,req.portalUser,req.body));}
    catch(error) {res.status(error.status || (error.message.startsWith('Invalid')?400:503)).json({error:error.status===409?error.message:'The message could not be saved. Retry with the same message.'});}
  });
  router.all(ROUTE+'/*',(req,res)=>res.status(404).json({error:'Not found.'}));
}
module.exports={install,page,history,post,validate,ROSTER};
