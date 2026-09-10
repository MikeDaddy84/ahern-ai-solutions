(function () {
  'use strict';
  var root = document.querySelector('[data-workflow-demo]');
  if (!root) return;
  var scenarios = {
    leads: {
      id: 'L-1042', origin: 'Website inquiry / Sample lead L-1042', title: 'A lead arrives after hours.',
      source: 'From: Taylor Morgan\nEmail: taylor@example.com\n“My water heater is leaking. Can someone come today? Please email me.”',
      before: 'Without a workflow: the inquiry waits in an inbox until someone notices it.',
      steps: [
        { title: 'Capture the inquiry', hint: 'Turn the message into a contact and a clear request.', destination: 'Lead record', fields: [['Lead', 'L-1042 · Taylor Morgan'], ['Email', 'taylor@example.com'], ['Request', 'Leaking water heater · needed today']] },
        { title: 'Flag the urgent job', hint: 'Apply the urgency rule and assign a follow-up.', destination: 'Priority queue', fields: [['Rule matched', '“Today” → urgent'], ['Assigned to', 'Service coordinator'], ['Next task', 'Confirm address and availability']] },
        { title: 'Prepare a reply', hint: 'Draft a response for a person to review.', destination: 'Reply draft', fields: [['To', 'taylor@example.com'], ['Status', 'Awaiting your approval']], message: 'Hi Taylor, thanks for reaching out about your water heater. What is the service address and best callback number? We’ll check availability for today.' }
      ],
      result: 'A lead with an owner and a reply ready to review.',
      outcome: 'The inquiry is captured, urgency is flagged, and the next step is assigned. You confirm availability and approve the reply before it goes out.'
    },
    inbox: {
      id: 'E-208', origin: 'Shared inbox / Sample email E-208', title: 'One more email. Already sorted.',
      source: 'From: Jordan Lee <jordan@example.com>\nSubject: Invoice 1042\n“Could you send a copy of the invoice for last month’s service? I can’t find it.”',
      before: 'Without a workflow: someone reads, forwards, and re-explains the same request.',
      steps: [
        { title: 'Identify the request', hint: 'Pull the purpose and invoice reference from the email.', destination: 'Classified email', fields: [['Message', 'E-208 · Jordan Lee'], ['Category', 'Billing · invoice copy'], ['Invoice reference', '1042']] },
        { title: 'Route to billing', hint: 'Give the right person the request and its context.', destination: 'Billing queue', fields: [['Assigned to', 'Billing team'], ['Task', 'Locate invoice 1042'], ['Review required', 'Verify requester before sharing invoice']] },
        { title: 'Prepare the response', hint: 'Put a draft beside the task so nobody starts from scratch.', destination: 'Reply draft', fields: [['To', 'jordan@example.com'], ['Status', 'Awaiting identity check and approval']], message: 'Hi Jordan, thanks for getting in touch. We’re checking the details for invoice 1042 and will follow up with you.' }
      ],
      result: 'A billing task with context, an owner, and a draft.',
      outcome: 'The email reaches the right queue without manual forwarding. A person verifies the requester and invoice before approving any reply or attachment.'
    },
    entry: {
      id: 'INV-2087', origin: 'Invoice attachment / Sample invoice INV-2087', title: 'An invoice becomes a usable record.',
      source: 'Northline Office Supply (sample)\nInvoice: INV-2087\nCustomer: Example Workshop\n3 monitor arms × $80.00\nTotal: $240.00\nDue date: Not provided',
      before: 'Without a workflow: someone copies the invoice into a spreadsheet and checks each field.',
      steps: [
        { title: 'Extract the fields', hint: 'Read the invoice into a structured record.', destination: 'Extracted invoice', fields: [['Supplier', 'Northline Office Supply'], ['Invoice', 'INV-2087'], ['Line total', '3 × $80.00 = $240.00']] },
        { title: 'Check the record', hint: 'Check the total, duplicates, and required fields.', destination: 'Validation', fields: [['Total check', '$240.00 · matches line items'], ['Duplicate check', 'No match in sample records'], ['Needs attention', 'Due date missing · send to review']] },
        { title: 'Stage a row for review', hint: 'Keep the extracted data and flag the missing detail.', destination: 'Spreadsheet review row', fields: [['Invoice / Supplier', 'INV-2087 · Northline Office Supply'], ['Amount / Due date', '$240.00 / Missing'], ['Status', 'Needs review · not posted to accounts']] }
      ],
      result: 'The row is prepared. The missing date stays visible.',
      outcome: 'The details are copied once and the total is checked. You confirm the missing due date before the record is posted; the workflow does not guess.'
    }
  };
  function el(id) { return root.querySelector('#workflow-' + id); }
  var run = el('run'), next = el('next'), steps = el('steps'), status = el('status');
  var selected = 'leads', completed = 0, playing = false, timer = null, generation = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stop() { clearTimeout(timer); timer = null; playing = false; generation++; }
  function controls() {
    run.disabled = false;
    run.textContent = playing ? 'Pause example' : completed === 3 ? 'Replay example' : completed ? 'Continue example →' : 'Run this example →';
    next.disabled = completed === 3;
    el('progress-label').textContent = (completed === 3 ? 'Complete' : playing ? 'Running' : completed ? 'Paused' : 'Ready') + ' · ' + completed + ' of 3 steps';
  }
  function reset(key) {
    stop(); selected = key; completed = 0;
    var scenario = scenarios[key];
    ['origin', 'title', 'source', 'before'].forEach(function (name) { el(name).textContent = scenario[name]; });
    el('result').hidden = true;
    el('progress-bar').style.width = '0%';
    el('traveler').textContent = scenario.id + ' · Ready';
    steps.replaceChildren();
    scenario.steps.forEach(function (step, index) {
      var li = document.createElement('li');
      var number = document.createElement('span'); number.textContent = '0' + (index + 1);
      var body = document.createElement('div');
      var heading = document.createElement('h3'); heading.textContent = step.title;
      var hint = document.createElement('p'); hint.textContent = step.hint;
      body.append(heading, hint); li.append(number, body); steps.append(li);
    });
    root.querySelectorAll('[data-scenario]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.scenario === selected)); });
    status.textContent = 'Ready. Run the example or use Next step to go at your own pace.';
    controls();
  }
  function advance() {
    if (completed >= 3) return;
    var scenario = scenarios[selected], step = scenario.steps[completed], li = steps.children[completed];
    steps.querySelectorAll('[aria-current]').forEach(function (item) { item.removeAttribute('aria-current'); });
    li.setAttribute('aria-current', 'step'); li.classList.add('is-complete');
    li.firstElementChild.textContent = '✓';
    var record = document.createElement('div'); record.className = 'workflow-record';
    var label = document.createElement('p'); label.className = 'workflow-record-label'; label.textContent = scenario.id + ' / ' + step.destination;
    var fields = document.createElement('dl');
    step.fields.forEach(function (field) {
      var term = document.createElement('dt'), value = document.createElement('dd');
      term.textContent = field[0]; value.textContent = field[1]; fields.append(term, value);
    });
    record.append(label, fields);
    if (step.message) { var message = document.createElement('blockquote'); message.textContent = step.message; record.append(message); }
    li.lastElementChild.append(record);
    completed++;
    el('progress-bar').style.width = (completed / 3 * 100) + '%';
    el('traveler').textContent = scenario.id + ' · ' + step.destination;
    status.textContent = 'Step ' + completed + ' of 3: ' + scenario.id + ' → ' + step.destination + '. ' + step.fields[step.fields.length - 1].join(': ') + '.';
    if (completed === 3) {
      if (window.ahernTrack) window.ahernTrack('demo_completed', 'automation');
      stop(); el('result-title').textContent = scenario.result; el('result-copy').textContent = scenario.outcome;
      el('result').hidden = false;
      status.textContent += '. Example complete. ' + scenario.result + ' Sample data only; nothing was sent or saved.';
    }
    controls();
  }
  function schedule() {
    var current = generation;
    timer = setTimeout(function () {
      if (!playing || current !== generation) return;
      advance(); if (playing) schedule();
    }, reduced ? 0 : 2400);
  }
  root.querySelectorAll('[data-scenario]').forEach(function (button) {
    button.addEventListener('click', function () { reset(button.dataset.scenario); });
  });
  run.addEventListener('click', function () {
    if (playing) { stop(); controls(); status.textContent = 'Paused after step ' + completed + '. Continue or use Next step.'; return; }
    if (completed === 3) reset(selected);
    playing = true; advance(); if (playing) schedule();
  });
  next.addEventListener('click', function () { stop(); advance(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && playing) { stop(); controls(); status.textContent = 'Paused. Continue when you are ready.'; }
  });
  reset(selected);
})();
