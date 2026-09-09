const { escapeHtml } = require('./layout');

const services = {
  automation: {
    title: 'AI automation for North Texas businesses', eyebrow: 'Less repetition. More room to work.',
    heading: 'Put the busywork\non autopilot.',
    intro: 'Connect the tools you already use so inquiries, follow-ups, and routine admin keep moving—even when you are doing something else.',
    cta: 'Plan my first automation', interest: 'AI automation',
    outcomes: [
      ['Respond to new leads', 'Capture the inquiry, draft a useful response, and get urgent jobs in front of the right person.'],
      ['Tame the shared inbox', 'Sort routine messages, extract the details, and prepare replies for someone to approve.'],
      ['Stop entering things twice', 'Move structured information into your spreadsheet or CRM, with checks for missing details.']
    ],
    fit: 'A good starting point is one repetitive task you can explain and measure. We agree what should happen automatically, what needs a person, and how failures should be handled.',
    scope: 'Quickstart begins at $1,250 for one workflow. A $4,500 Sprint connects two or three workflows. Existing software subscriptions and any additional tool costs are discussed before work starts.',
    link: '/#pricing', linkLabel: 'Compare automation packages',
    questions: [
      ['Will AI send messages without my approval?', 'Only if that is part of the scope we agree. Drafts can wait for your review, while predictable routing and data entry run automatically.'],
      ['Will I have to replace my current tools?', 'Usually we begin with what you already use. We check the available integrations before recommending a workflow.']
    ]
  },
  'custom-pcs': {
    title: 'Custom gaming PCs and workstations in North Texas', eyebrow: 'Built for what you actually run',
    heading: 'Your workload.\nYour machine.',
    intro: 'A gaming rig, a quiet editing workstation, or a dependable office PC. Start with the experience you want, then build the hardware around it.',
    cta: 'Open the 3D build studio', href: '/pc-builder',
    outcomes: [
      ['Play', 'Choose your games, resolution, and performance goals. Balance the CPU and GPU around the way you play.'],
      ['Create', 'Size the machine for editing, rendering, design, audio, and the applications you use every day.'],
      ['Work', 'Make room for reliable storage, low noise, comfortable multitasking, and future upgrades.']
    ],
    fit: 'The build studio gives you a visual starting point and a running estimate. A consultation confirms compatibility, exact components, availability, and the final scope before anything is purchased.',
    scope: 'Estimates separate hardware, a disclosed 10% handling fee, and build labor. Shipping, tax, and peripherals are separate. You can compare two builds before requesting a quote.',
    link: '/pc-builder?track=gaming', linkLabel: 'Start a gaming build',
    questions: [
      ['Is the 3D model the exact computer I will receive?', 'It is an illustration of the selected hardware and form factor. Exact case dimensions, brands, finishes, and component clearances are confirmed in your final quote.'],
      ['Can we work backward from a target budget?', 'Yes. Explore the builder first, then tell me your target. We can identify which changes save money without compromising your main workload.']
    ]
  },
  'local-ai': {
    title: 'Private local AI systems for North Texas businesses', eyebrow: 'Your hardware. Your control.',
    heading: 'Bring AI closer\nto your work.',
    intro: 'Explore private document search, local assistants, and AI workflows on hardware you control. Match the system to the job before buying more GPU than you need.',
    cta: 'Explore local AI hardware', href: '/pc-builder?track=ai',
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
      ['Does local AI automatically make my data secure?', 'No. User permissions, device security, backups, network configuration, and the document workflow still need attention. The design covers those requirements explicitly.']
    ]
  }
};

function demoHtml() {
  return `<section class="section section-alt" id="automation-demo"><div class="container">
    <div class="section-head"><p class="eyebrow">See the workflow</p><h2 class="section-title">From incoming to handled.</h2><p class="section-sub">Pick a common bottleneck and walk through an example.</p></div>
    <div class="workflow-demo" data-workflow-demo>
      <div class="workflow-toolbar"><div class="workflow-tabs" role="group" aria-label="Example workflow">
        <button type="button" data-scenario="leads" aria-pressed="true">Missed leads</button><button type="button" data-scenario="inbox" aria-pressed="false">Inbox overload</button><button type="button" data-scenario="entry" aria-pressed="false">Double entry</button>
      </div><span class="workflow-sample">Sample data · nothing is sent</span></div>
      <div class="workflow-body"><div class="workflow-input"><p class="eyebrow">01 / Incoming</p><h3 id="workflow-title">A new customer inquiry</h3><p id="workflow-source">Name: Taylor\nBusiness: Example Plumbing\nRequest: A leaking water heater needs attention today.\nReply by: Email</p><button type="button" class="btn btn-primary" id="workflow-run">Run this example <span aria-hidden="true">→</span></button></div>
        <ol class="workflow-steps" id="workflow-steps"><li><span>02</span><div><h3>Extract the details</h3><p>Name, job, and preferred reply method.</p></div></li><li><span>03</span><div><h3>Route the work</h3><p>Urgent requests are flagged for a person.</p></div></li><li><span>04</span><div><h3>Prepare the next step</h3><p>A reply draft waits for approval.</p></div></li></ol></div>
      <p class="workflow-status" id="workflow-status" role="status" aria-live="polite">An interactive walkthrough using preset examples, not a connected customer system.</p>
    </div><p class="demo-followup"><a class="text-link" href="/?interest=AI%20automation#audit">Find a workflow worth automating in my business →</a></p>
  </div></section>`;
}

function serviceHtml(slug) {
  const s = services[slug];
  if (!s) return null;
  const href = s.href || '/?interest=' + encodeURIComponent(s.interest) + '#audit';
  return `<section class="container service-hero"><p class="eyebrow">${escapeHtml(s.eyebrow)}</p><h1>${escapeHtml(s.heading).replace('\n', '<br>')}</h1><p class="section-sub">${escapeHtml(s.intro)}</p><a class="btn btn-primary" href="${href}">${escapeHtml(s.cta)} →</a></section>
    <section class="section section-alt"><div class="container"><div class="service-pillars">${s.outcomes.map(([title, copy], i) => `<article class="pillar-card"><span class="pillar-number">0${i + 1}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></article>`).join('')}</div></div></section>
    ${slug === 'automation' ? demoHtml() : ''}
    <section class="section"><div class="container service-details"><div><p class="eyebrow">Find the fit</p><h2 class="section-title">Start with the job.</h2><p>${escapeHtml(s.fit)}</p></div><div><p class="eyebrow">Scope & pricing</p><p>${escapeHtml(s.scope)}</p><a class="text-link" href="${s.link}">${escapeHtml(s.linkLabel)} →</a></div></div></section>
    <section class="section section-alt"><div class="container narrow"><h2 class="section-title">Before we start</h2><div class="faq">${s.questions.map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}</div><a class="btn btn-primary" href="${href}">${escapeHtml(s.cta)}</a></div></section>`;
}
module.exports = { services, serviceHtml, demoHtml };
