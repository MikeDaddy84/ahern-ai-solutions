(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.AhernPlanning = api; api.mount(root); }
})(typeof window === 'undefined' ? null : window, function () {
  function calculate(v) {
    var limits = [100000,1440,10000,100,10000,1000000,100000];
    if (v.length !== limits.length || v.some(function(n,i){return !Number.isFinite(n)||n<0||n>limits[i];})) return null;
    var hours=v[0]*v[1]/60*v[3]/100-v[4], value=hours*v[2]-v[6];
    return {hours:hours,value:value,recovery:value>0?v[5]/value:null};
  }
  function aiFit(v) {
    var title=v.task==='documents'?'A document assistant pilot':v.task==='coding'?'A coding workflow pilot':v.task==='drafting'?'A drafting and review pilot':'Start with a use-case conversation';
    var notes=['Test a representative workload before choosing hardware.'];
    if(v.documents==='scans') notes.push('Include document cleanup and scan recognition in the pilot.');
    if(v.documents==='none'&&v.task==='documents') notes.push('Prepare a small source collection before evaluating search.');
    if(v.users==='team') notes.push('Test simultaneous use and separate user permissions.');
    if(v.boundary==='local') notes.push('Map every processing step and external connection against your local-only requirement.');
    else if(v.boundary==='hybrid') notes.push('Compare local and cloud costs and decide what may leave your hardware.');
    else notes.push('Agree data boundaries before selecting a model or service.');
    if(v.hardware==='existing') notes.push('Check the existing computer before proposing a new purchase.');
    return {title:title,text:notes.join(' ')};
  }
  function mount(w) {
    var d=w.document, money=function(n){return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});};
    d.querySelectorAll('.plan-section button').forEach(function(button){button.disabled=false;});
    var track=function(event,service){if(w.ahernTrack) w.ahernTrack(event,service);};
    d.querySelectorAll('[data-planner]').forEach(function(form){
      var type=form.dataset.planner, summary='', valid=false;
      function update(announce) {
        var title,text;
        if(type==='automation') {
          var values=Array.from(form.querySelectorAll('input')).map(function(i){return i.value.trim()===''?NaN:Number(i.value);});
          var result=calculate(values); valid=!!result;
          if(!result){title='Check your numbers';text='Fill in every field using a value within the displayed limits.';}
          else {title=result.hours.toFixed(1)+' net hours of capacity per month';text=money(result.value)+' per month after your ongoing costs. '+(result.recovery===null?'No positive return on these assumptions.':values[5]===0?'No setup cost entered.':'Setup recovery: about '+result.recovery.toFixed(1)+' months.');}
        } else if(type==='local-ai') {
          var fit=aiFit({task:form.elements['ai-task'].value,documents:form.elements['ai-documents'].value,users:form.elements['ai-users'].value,boundary:form.elements['ai-boundary'].value,hardware:form.elements['ai-hardware'].value});title=fit.title;text=fit.text;valid=true;
        } else {
          var missing=Array.from(form.querySelectorAll('select')).filter(function(s){return s.value==='no';}).map(function(s){return s.closest('label').querySelector('span').textContent;});
          title=missing.length?missing.length+' intake handoff'+(missing.length===1?'':'s')+' to improve':'Your intake basics are in place';
          text=missing.length?'Start here: '+missing.join(' ')+' We can agree a simple first improvement.':'Review real inquiries and response times before investing in more features.';valid=true;
        }
        form.querySelector('[data-plan-title]').textContent=title;form.querySelector('[data-plan-result]').textContent=text;
        summary=Array.from(form.querySelectorAll('input,select')).map(function(el){return el.closest('label').querySelector('span').textContent+': '+(el.tagName==='SELECT'?el.options[el.selectedIndex].text:el.value);}).join('\n')+'\nScenario: '+title+'\n'+text;
        var link=form.querySelector('[data-plan-handoff]');link.setAttribute('aria-disabled',String(!valid));
        if(announce){form.querySelector('.plan-status').textContent=title+'. '+text;if(valid)track('assessment_completed',type);}
      }
      form.addEventListener('input',function(){update(false);});form.addEventListener('change',function(){update(false);});
      form.addEventListener('submit',function(ev){ev.preventDefault();update(true);});
      form.querySelector('[data-plan-handoff]').addEventListener('click',function(ev){
        update(false);if(!valid){ev.preventDefault();form.reportValidity();return;}
        try {w.sessionStorage.setItem('ahern-plan',JSON.stringify({service:type,summary:summary,createdAt:Date.now()}));var destination=new w.URL(this.href);destination.searchParams.set('plan',type);this.href=destination.href;}
        catch(_){ev.preventDefault();form.querySelector('.plan-status').textContent='Your browser could not carry this plan forward. Copy the scenario above, or use the free consultation link in the navigation.';}
        track('quote_requested',type);
      });
      update(false);
    });
    var demo=d.querySelector('[data-document-demo]');
    if(demo)demo.querySelector('[data-document-run]').addEventListener('click',function(){var supported=demo.querySelector('select').value==='supported';demo.querySelector('[data-answer-title]').textContent=supported?'Before pickup':'The source does not say';demo.querySelector('[data-answer]').textContent=supported?'The technician records components and completes a stability check.':'The handbook does not specify a warranty length. Ask the responsible person; do not invent a term.';demo.querySelector('[data-citation]').textContent=supported?'Source: Workshop delivery process, section 2.':'No supporting passage for this question.';track('demo_completed','local-ai');});
    var intake=d.querySelector('[data-intake-demo]');
    if(intake){var step=0;intake.querySelector('button').addEventListener('click',function(){step=step===4?0:step+1;Array.from(intake.querySelectorAll('li')).forEach(function(li,i){li.classList.toggle('is-active',i<step);});intake.querySelector('[data-intake-status]').textContent=step===4?'Sample complete. Mike reviews the inquiry; no message was sent.':(step?'Step '+step+' of 4: '+intake.querySelectorAll('li strong')[step-1].textContent:'Ready · 0 of 4 steps');this.textContent=step===4?'Reset the example':'Follow the request';if(step===4)track('demo_completed','websites');});}
    var print=d.querySelector('[data-print-guides]');if(print)print.addEventListener('click',function(){w.print();});
  }
  return {calculate:calculate,aiFit:aiFit,mount:mount};
});
