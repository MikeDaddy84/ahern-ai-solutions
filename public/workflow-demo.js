(function () {
  if (!document.querySelector('[data-workflow-demo]')) return;
  var scenarios = {
    leads: { title: 'A new customer inquiry', source: 'Name: Taylor\nBusiness: Example Plumbing\nRequest: A leaking water heater needs attention today.\nReply by: Email',
      steps: [['Extract the details', 'Taylor · Example Plumbing · water heater · email reply.'], ['Flag the urgent job', '“Today” triggers the urgency rule. Add the inquiry to the priority queue.'], ['Prepare a reply for approval', 'Draft: “Thanks, Taylor. I have your water-heater inquiry. What is the service address and best callback number?”']] },
    inbox: { title: 'A shared inbox request', source: 'From: Example customer\nSubject: Copy of invoice 1042\nMessage: Could you send the invoice for last month’s service?',
      steps: [['Identify the request', 'Billing request · invoice reference 1042.'], ['Send it to the right queue', 'Route to billing. A person checks the customer and invoice before sharing anything.'], ['Prepare the next action', 'Draft: “Thanks for getting in touch. I’m checking the invoice details and will follow up.”']] },
    entry: { title: 'A job form ready to file', source: 'Customer: Example Workshop\nJob: Replace office switch\nLocation: Main office\nRequested date: Next week',
      steps: [['Read the form fields', 'Customer: Example Workshop · job: replace office switch.'], ['Check before creating a record', 'Required fields are present. Check the CRM for an existing customer and duplicate job.'], ['Prepare the job record', 'A structured record is ready: customer, location, job, and requested date. No retyping.']] }
  };
  var selected = 'leads', timer = null, generation = 0;
  var run = document.getElementById('workflow-run');
  var steps = document.getElementById('workflow-steps');
  var status = document.getElementById('workflow-status');
  function reset(key) {
    clearTimeout(timer); generation++; selected = key;
    document.getElementById('workflow-title').textContent = scenarios[key].title;
    document.getElementById('workflow-source').textContent = scenarios[key].source;
    steps.querySelectorAll('li').forEach(function (li, index) {
      li.classList.remove('is-complete'); li.querySelector('h3').textContent = scenarios[key].steps[index][0];
      li.querySelector('p').textContent = 'Ready to run';
    });
    run.disabled = false; run.textContent = 'Run this example →';
    status.textContent = 'Preset example. No messages are sent and no customer records are created.';
    document.querySelectorAll('[data-scenario]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.scenario === key)); });
  }
  document.querySelectorAll('[data-scenario]').forEach(function (button) { button.addEventListener('click', function () { reset(button.dataset.scenario); }); });
  run.addEventListener('click', function () {
    reset(selected); var current = generation; var index = 0;
    run.disabled = true; run.textContent = 'Walking through…';
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function next() {
      if (current !== generation) return;
      var li = steps.children[index]; li.classList.add('is-complete');
      li.querySelector('p').textContent = scenarios[selected].steps[index][1]; index++;
      if (index < 3) timer = setTimeout(next, reduced ? 0 : 700);
      else { run.disabled = false; run.textContent = 'Replay example'; status.textContent = 'Example complete. In a real workflow, your connected tools perform these steps under the rules we agree.'; }
    }
    next();
  });
})();
