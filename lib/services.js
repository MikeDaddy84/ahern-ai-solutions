const { escapeHtml } = require('./layout');
const fs = require('node:fs');
const path = require('node:path');
// The relocated content stays in readable HTML fragments, loaded once at startup.
const sections = Object.fromEntries(['hardware', 'pricing', 'web', 'builderDemo'].map(key => [
  key, fs.readFileSync(path.join(__dirname, '..', 'content', 'services', key + '.html'), 'utf8')
]));

const services = {
  automation: {
    title: 'AI automation for North Texas businesses', eyebrow: 'AI automation for businesses',
    heading: 'Put the busywork\non autopilot.',
    intro: 'Connect the tools you already use so inquiries, follow-ups, and routine admin keep moving—even when you are doing something else.',
    cta: 'Plan my first automation', interest: 'AI automation',
    secondaryHref: '#automation-demo', secondaryLabel: 'Try a workflow',
    outcomes: [
      ['Respond to new leads', 'Capture the inquiry, draft a useful response, and get urgent jobs in front of the right person.'],
      ['Tame the shared inbox', 'Sort routine messages, extract the details, and prepare replies for someone to approve.'],
      ['Stop entering things twice', 'Move structured information into your spreadsheet or CRM, with checks for missing details.']
    ],
    fit: 'A good starting point is one repetitive task you can explain and measure. We agree what should happen automatically, what needs a person, and how failures should be handled.',
    scope: 'Quickstart begins at $1,250 for one workflow. A $4,500 Sprint connects two or three workflows. Existing software subscriptions and any additional tool costs are discussed before work starts.',
    link: '#pricing', linkLabel: 'Compare automation packages',
    questions: [
      ['Will AI send messages without my approval?', 'Only if that is part of the scope we agree. Drafts can wait for your review, while predictable routing and data entry run automatically.'],
      ['Will I have to replace my current tools?', 'Usually we begin with what you already use. We check the available integrations before recommending a workflow.'],
      ['What tools do you work with?', 'Common tools include Gmail and Outlook, Google Calendar, Calendly, spreadsheets, and automation platforms like Zapier and Make. The first step is checking how your existing tools can connect.'],
      ['How fast can we launch?', 'The AI Quickstart is typically live in about 7 days. An Automation Sprint takes 2–3 weeks. We confirm the scope and timing after the free audit.'],
      ['Do automation packages include custom software development?', 'The standard automation packages focus on connecting your existing tools and platforms. I also build custom software, including dashboards, client portals, and internal apps. Custom development is scoped and quoted separately through my websites and custom business tools service.']
    ]
  },
  'custom-pcs': {
    title: 'Custom gaming PCs and workstations in North Texas', eyebrow: 'Custom gaming PCs & workstations',
    heading: 'Your workload.\nYour machine.',
    intro: 'A gaming rig, a quiet editing workstation, or a dependable office PC. Start with the experience you want, then build the hardware around it.',
    cta: 'Start a gaming build', href: '/pc-builder?track=gaming', interest: 'Custom gaming PC',
    outcomes: [
      ['Play', 'Choose your games, resolution, and performance goals. Balance the CPU and GPU around the way you play.'],
      ['Create', 'Size the machine for editing, rendering, design, audio, and the applications you use every day.'],
      ['Work', 'Make room for reliable storage, low noise, comfortable multitasking, and future upgrades.']
    ],
    fit: 'The build studio gives you a visual starting point and a running estimate. A consultation confirms compatibility, exact components, availability, and the final scope before anything is purchased.',
    scope: 'Estimates separate hardware, a disclosed 10% handling fee, and build labor. Shipping, tax, and peripherals are separate. You can compare two builds before requesting a quote.',
    link: '/pc-builder?track=creative', linkLabel: 'Build a creative workstation',
    questions: [
      ['Is the 3D model the exact computer I will receive?', 'It is an illustration of the selected hardware and form factor. Exact case dimensions, brands, finishes, and component clearances are confirmed in your final quote.'],
      ['Can we work backward from a target budget?', 'Yes. Explore the builder first, then tell me your target. We can identify which changes save money without compromising your main workload.'],
      ['What should I bring to the consultation?', 'Your main games or applications, monitor resolution, performance goals, and any parts you want to reuse. Noise, appearance, space, and future upgrades also help shape the build.'],
      ['Is the builder estimate a final quote?', 'No. It is a starting range. Exact parts, availability, compatibility, and the final price are confirmed before anything is purchased.']
    ]
  },
  'local-ai': {
    title: 'Private local AI systems for North Texas businesses', eyebrow: 'Private AI on your own hardware',
    heading: 'Bring AI closer\nto your work.',
    intro: 'Explore private document search, local assistants, and AI workflows on hardware you control. Match the system to the job before buying more GPU than you need.',
    cta: 'Plan my private AI system', interest: 'Business local AI system',
    secondaryHref: '/pc-builder?track=ai', secondaryLabel: 'Explore AI hardware',
    outcomes: [
      ['Search internal knowledge', 'Find useful passages in a controlled collection of documents, with references back to the source.'],
      ['Choose the right form factor', 'Compare an expandable workstation with a turnkey appliance. Memory capacity, response speed, and upgradeability all matter.'],
      ['Connect the workflow', 'Plan the model, inference software, access controls, document pipeline, and handoff together.']
    ],
    fit: 'Start with the task, document types, number of simultaneous users, and acceptable response time. We validate the proposed setup against a representative workload before calling it a fit.',
    scope: 'Local AI hardware and setup are quoted separately. Some workflows may still need cloud services; we identify those connections and what information they carry before implementation.',
    link: '/blog/private-local-ai-law-office', linkLabel: 'Read a local AI reference build',
    questions: [
      ['Will every task run without the internet?', 'Many models can work offline after setup. Updates, external integrations, and any cloud services are separate dependencies that need to be planned.'],
      ['Does local AI automatically make my data secure?', 'No. User permissions, device security, backups, network configuration, and the document workflow still need attention. The design covers those requirements explicitly.'],
      ['What does local AI mean?', 'The model runs on a computer you control instead of sending every request to a hosted AI service. The system can support document search, assistants, and other workflows; its capabilities depend on the model and hardware.'],
      ['Do I need an expensive GPU workstation?', 'Not always. A compact appliance may fit your workload; an expandable workstation offers different performance and upgrade options. Model size, simultaneous users, and response-time expectations guide the choice.'],
      ['Are there ongoing costs?', 'Running a local model avoids per-request cloud inference charges for that model. Electricity, maintenance, backups, support, and any separately selected cloud services still need to be considered.']
    ]
  },
  websites: {
    title: 'Websites and custom business tools in North Texas', eyebrow: 'Websites & custom business tools',
    heading: 'A better front door.\nA connected business.',
    intro: 'A website that feeds your intake process, or an internal tool built around the way you work. Start with the workflow behind the screen. Website engagements start at $6,500.',
    cta: 'Discuss my website or tool', interest: 'Website or custom app',
    outcomes: [
      ['Capture the inquiry', 'Connect forms to the inbox or CRM where you manage the work.'],
      ['Make the next step clear', 'Plan reply drafts, urgency routing, and handoffs as part of the same system.'],
      ['Simplify internal work', 'Scope a dashboard, client portal, or quoting tool around the process it needs to improve.']
    ],
    fit: 'Start with who will use the site or tool, what they need to accomplish, and where the information should go next. If an existing tool or a simpler automation covers the need, I will say so.',
    scope: 'The Front Door bundles a website with intake automation. Standalone websites and custom tools have separate scopes. Compare the full pricing below before requesting a consultation.',
    link: '#web', linkLabel: 'See website and tool pricing',
    questions: [
      ['Can I get a website without automation?', 'Yes. Website-only work starts at $9,500. The Front Door bundle is $6,500–9,500 because connected intake is the focus of this service.'],
      ['What happens after launch?', 'The first 12 months of the care plan are included. After that, care is month to month at the level agreed in your scope.'],
      ['Do you build custom software and internal apps?', 'Yes. I build custom software around the way your business works, including dashboards, client portals, quoting tools, and internal apps. We define the features, integrations, and budget together before development starts.']
    ]
  }
};

function demoHtml() {
  return `<section class="section section-alt" id="automation-demo"><div class="container">
    <div class="section-head"><p class="eyebrow">Try an automation</p><h2 class="section-title">From incoming to handled.</h2><p class="section-sub">Choose a bottleneck. Follow one sample from the first message to the next action.</p></div>
    <div class="workflow-demo" data-workflow-demo>
      <div class="workflow-toolbar"><div class="workflow-tabs" role="group" aria-label="Example workflow">
        <button type="button" data-scenario="leads" aria-pressed="true">Missed leads</button><button type="button" data-scenario="inbox" aria-pressed="false">Inbox overload</button><button type="button" data-scenario="entry" aria-pressed="false">Manual data entry</button>
      </div><span class="workflow-sample">Sample data · nothing is sent</span></div>
      <div class="workflow-body"><div class="workflow-input"><p class="eyebrow" id="workflow-origin">Website inquiry / Sample lead L-1042</p><h3 id="workflow-title">A lead arrives after hours.</h3><p id="workflow-source">From: Taylor Morgan\nEmail: taylor@example.com\n“My water heater is leaking. Can someone come today? Please email me.”</p><p class="workflow-before" id="workflow-before">Without a workflow: the inquiry waits in an inbox until someone notices it.</p><div class="workflow-controls"><button type="button" class="btn btn-primary" id="workflow-run" disabled>Run this example →</button><button type="button" class="btn btn-ghost" id="workflow-next" disabled>Next step</button></div><noscript><p>Enable JavaScript to run the demo. This example captures the lead, flags the urgent request, and prepares a reply for your approval.</p></noscript><p class="workflow-caption">A proposed workflow using fictional data. Your tools and rules are agreed before the build.</p></div>
        <div class="workflow-process"><div class="workflow-progress"><span id="workflow-progress-label">Ready · 0 of 3 steps</span><span class="workflow-traveler" id="workflow-traveler">L-1042 · Ready</span></div><div class="workflow-track" aria-hidden="true"><span id="workflow-progress-bar"></span></div><ol class="workflow-steps" id="workflow-steps"><li><span>01</span><div><h3>Capture the inquiry</h3><p>Name, request, and reply method become a lead record.</p></div></li><li><span>02</span><div><h3>Flag the urgent job</h3><p>Urgent requests are assigned to a person.</p></div></li><li><span>03</span><div><h3>Prepare a reply</h3><p>A reply draft waits for approval.</p></div></li></ol></div></div>
      <div class="workflow-result" id="workflow-result" hidden><p class="eyebrow">What changed</p><h3 id="workflow-result-title"></h3><p id="workflow-result-copy"></p></div>
      <p class="workflow-status" id="workflow-status" role="status" aria-live="polite" aria-atomic="true">Ready. Run the example or use Next step to go at your own pace.</p>
    </div><p class="demo-followup"><a class="text-link" href="/?interest=AI%20automation#audit">Find a workflow worth automating in my business →</a></p>
  </div></section>`;
}

function serviceHtml(slug) {
  const s = services[slug];
  if (!s) return null;
  const href = s.href || '/?interest=' + encodeURIComponent(s.interest) + '#audit';
  const consult = '/?interest=' + encodeURIComponent(s.interest) + '#audit';
  const secondaryHref = s.secondaryHref || (s.href ? consult : null);
  const secondaryLabel = s.secondaryLabel || 'Talk through my build';
  return `<section class="container service-hero"><a class="service-back" href="/#services">← All services</a><p class="eyebrow">${escapeHtml(s.eyebrow)}</p><h1>${escapeHtml(s.heading).replace('\n', '<br>')}</h1><p class="section-sub">${escapeHtml(s.intro)}</p><div class="service-actions"><a class="btn btn-primary" href="${href}">${escapeHtml(s.cta)} →</a>${secondaryHref ? `<a class="btn btn-ghost" href="${secondaryHref}">${escapeHtml(secondaryLabel)}</a>` : ''}</div></section>
    ${slug === 'automation' ? demoHtml() : ''}
    <section class="section section-alt"><div class="container"><div class="service-pillars">${s.outcomes.map(([title, copy], i) => `<article class="pillar-card"><span class="pillar-number">0${i + 1}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></article>`).join('')}</div></div></section>
    <section class="section"><div class="container service-details"><div><p class="eyebrow">Find the fit</p><h2 class="section-title">Start with the job.</h2><p>${escapeHtml(s.fit)}</p></div><div><p class="eyebrow">Scope & pricing</p><p>${escapeHtml(s.scope)}</p><a class="text-link" href="${s.link}">${escapeHtml(s.linkLabel)} →</a></div></div></section>
    ${slug === 'automation' ? sections.pricing + '<div class="container"><p class="pillars-aside">Need a website or internal tool with the workflow? <a href="/services/websites">Explore websites and custom tools →</a></p></div>' : ''}
    ${slug === 'websites' ? sections.web : ''}
    ${slug === 'custom-pcs' ? sections.hardware + '<section class="section"><div class="container service-details"><div><p class="eyebrow">Try a starting configuration</p><h2 class="section-title">See what changes the estimate.</h2><p>Choose a use, then take the estimate into the full builder to refine the parts.</p></div>' + sections.builderDemo + '</div></section>' : ''}
    <section class="section section-alt"><div class="container narrow"><h2 class="section-title">Before we start</h2><div class="faq">${s.questions.map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}</div><a class="btn btn-primary" href="${href}">${escapeHtml(s.cta)}</a></div></section>`;
}
module.exports = { services, serviceHtml, demoHtml };
