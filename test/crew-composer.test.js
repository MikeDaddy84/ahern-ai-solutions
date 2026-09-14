const test=require('node:test');
const assert=require('node:assert/strict');
const bind=require('../public/crew-room/composer-keys');
function setup(){let handler;const button={disabled:false};const calls=[];const form={querySelector:()=>button,requestSubmit:b=>calls.push(b)};const textarea={value:'Hello',addEventListener:(_,fn)=>handler=fn};bind(form,textarea);return {button,textarea,calls,press:opts=>{const event={key:'Enter',preventDefault(){this.prevented=true;},...opts};handler(event);return event;}};}
test('Enter submits through the normal form and passes the submit button',()=>{const s=setup();assert.equal(s.press().prevented,true);assert.deepEqual(s.calls,[s.button]);});
test('Shift+Enter and IME composition preserve text entry',()=>{for(const opts of [{shiftKey:true},{isComposing:true},{keyCode:229}]){const s=setup();assert.equal(s.press(opts).prevented,undefined);assert.equal(s.calls.length,0);}});
test('Held Enter cannot submit twice while the button is disabled; blanks do not send',()=>{const s=setup();s.button.disabled=true;s.press();assert.equal(s.calls.length,0);s.button.disabled=false;s.textarea.value=' \n ';s.press();assert.equal(s.calls.length,0);});
