const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {workspace} = require('../lib/ono-mail-workspace');

test('owner can open a folder and reader and explicitly submit a reply or forward', async t => {
  const dom = new JSDOM('<main id="main" data-csrf="fixture">'+workspace({id:'second',address:'second@example.test'})+'</main>',{
    url:'https://portal.example.test/portal/ono-sendai',runScripts:'outside-only'
  });
  t.after(()=>dom.window.close());
  const w=dom.window, doc=w.document, calls=[];
  w.matchMedia=()=>({matches:false});w.requestAnimationFrame=fn=>fn();
  w.confirm=()=>true;
  w.fetch=async (url,opts)=>{
    assert.equal(url,'/api/portal/ono-sendai/mail');
    assert.equal(opts.headers['X-CSRF-Token'],'fixture');
    const request=JSON.parse(opts.body);calls.push(request);
    assert.equal(request.account,'second');
    const results={
      folders:{address:'pilot@example.test',folders:[{id:'INBOX',name:'Inbox'},{id:'Projects',name:'Projects'}]},
      list:{validity:'9',messages:[{uid:17,sender:'Pat',subject:'<Work>',date:'',unread:true}],next:null},
      read:{headers:{Subject:'<Work>',From:'Pat',To:'Owner',Cc:'',Date:''},body:'<script>private</script>',
        attachments:['proposal.pdf'],replyTo:'pat@example.test',replyCc:'team@example.test'},
      send:{sent:true},move:{moved:true}
    };
    return {ok:true,json:async()=>results[request.action]};
  };
  const tick=()=>new Promise(r=>setImmediate(r));
  w.eval(fs.readFileSync(require.resolve('../public/ono-mail.js'),'utf8'));
  await tick();
  assert.equal(doc.querySelectorAll('#folder-list button').length,2);
  doc.querySelector('.mail-row').click();await tick();
  assert.equal(doc.querySelector('.mail-body').textContent,'<script>private</script>');
  assert.equal(doc.querySelector('.mail-body script'),null);
  const action=name=>[...doc.querySelectorAll('#reader button')].find(b=>b.textContent===name);
  for (const [label,kind] of [['Reply all','replyAll'],['Forward','forward']]) {
    action(label).click();await tick();
    const form=doc.querySelector('#composer');
    assert.equal(form.hidden,false);
    assert.equal(doc.querySelector('#compose-cc').value,kind==='replyAll'?'team@example.test':'');
    doc.querySelector('#compose-to').value='receiver@example.test';
    doc.querySelector('#compose-body').value='Hello';
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    const sent=calls.at(-1);
    assert.deepEqual([sent.action,sent.kind,sent.folder,sent.uid,sent.validity],['send',kind,'INBOX',17,'9']);
    assert.equal(form.hidden,true);
  }
  doc.querySelector('#reader select').value='Projects';action('Move').click();await tick();
  assert.equal(calls.find(x=>x.action==='move').destination,'Projects');
});
