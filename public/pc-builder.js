// Ahern AI Solutions — interactive PC Builder sandbox.
// Vanilla JS, data-driven quiz that assembles a possible build live as the
// visitor answers plain-language questions. No live pricing or vendor
// catalog yet (see README roadmap notes) — budgets are ballpark bands, and
// every build ends with "confirm the real spec on your free consult."
(function () {
  var panelEl = document.getElementById('builder-panel');
  var rigEl = document.getElementById('builder-rig');
  if (!panelEl || !rigEl) return;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Question data ----------
  var PURPOSE_STEP = {
    question: "What's this build mainly for?",
    sub: "Pick what's closest — we'll fine-tune everything on your free consult.",
    options: [
      { key: 'gaming', label: 'Gaming', sub: 'Play at the frame rate & detail you want',
        effect: function (b) { b.track = 'gaming'; b.trackLabel = 'Gaming PC'; b.interest = 'Custom gaming PC'; } },
      { key: 'creative', label: 'Creative & professional work', sub: 'Video, photo, 3D, music, design',
        effect: function (b) { b.track = 'creative'; b.trackLabel = 'Creator workstation'; b.interest = 'Professional workstation'; } },
      { key: 'ai', label: 'Business or local AI', sub: 'Flagship open-source LLMs & agents, on hardware you control',
        effect: function (b) { b.track = 'ai'; b.trackLabel = 'Local AI workstation'; b.interest = 'Business local AI system'; } },
      { key: 'everyday', label: 'Everyday & office use', sub: 'Browsing, email, calls, light work',
        effect: function (b) { b.track = 'everyday'; b.trackLabel = 'Everyday PC'; b.interest = 'Not sure yet'; } }
    ]
  };

  function budgetStep(bands) {
    var subs = ['Solid & budget-friendly', 'The sweet spot for most builds', 'High-end, built to last', 'No compromises'];
    return {
      question: "What's your target budget?",
      sub: "A ballpark range — we'll fit real parts and vendors to it on your free consult.",
      options: bands.map(function (label, i) {
        return { label: label, sub: subs[i], effect: function (b) { b.budget = label; } };
      })
    };
  }

  var TRACKS = {
    gaming: { steps: [
      { question: "What's the gaming target?", sub: 'This drives the GPU — the single biggest factor in how a game feels.',
        options: [
          { label: 'Competitive & high fps', sub: '1080p–1440p, maxed-out frame rate', effect: function (b) { b.gpu = 'RTX 4060 Ti / RX 7700 XT-class, 12–16GB'; b.cpu = 'High-frequency 6-core CPU (fast per-core speed for fps)'; } },
          { label: 'Cinematic single-player', sub: '1440p, high detail', effect: function (b) { b.gpu = 'RTX 4070 Ti-class, 12–16GB'; b.cpu = '8-core CPU, balanced'; } },
          { label: 'Go big — 4K', sub: '4K, everything maxed', effect: function (b) { b.gpu = 'RTX 4080 / 4090-class, 16GB+'; b.cpu = 'High-core-count CPU to keep up'; } },
          { label: 'Virtual reality', sub: 'Smooth, no-compromise VR', effect: function (b) { b.gpu = 'RTX 4070 Ti SUPER / 4080-class, 16GB+ (VR-ready)'; b.cpu = '8-core CPU'; b.notes.push('VR-ready GPU + fast USB for the headset'); } }
        ] },
      { question: 'Planning to stream or record while you play?', sub: 'Encoding while gaming benefits from extra CPU headroom.',
        options: [
          { label: 'Yes — streaming to Twitch/YouTube', sub: 'Live or recorded, on top of playing', effect: function (b) { b.notes.push('Extra CPU headroom reserved for streaming/encoding'); } },
          { label: 'No, just playing', sub: '', effect: function () {} }
        ] },
      { question: 'How many things do you usually have open at once?', sub: 'Sets how much memory (RAM) the build gets.',
        options: [
          { label: 'Just the game', sub: '16GB is plenty', effect: function (b) { b.ram = '16GB'; } },
          { label: 'Game + Discord + browser + Spotify', sub: 'The realistic default', effect: function (b) { b.ram = '32GB'; } },
          { label: 'I basically never close anything', sub: 'Heavy multitasker', effect: function (b) { b.ram = '64GB'; } }
        ] },
      { question: 'Storage — what fits your library?', sub: '',
        options: [
          { label: 'One fast drive is plenty', sub: '1TB NVMe SSD', effect: function (b) { b.storage = '1TB NVMe SSD'; } },
          { label: 'Give me room to grow', sub: '2TB NVMe SSD', effect: function (b) { b.storage = '2TB NVMe SSD'; } },
          { label: 'I hoard everything', sub: '4TB+ NVMe + bulk storage', effect: function (b) { b.storage = '4TB+ NVMe SSD + bulk HDD'; } }
        ] },
      { question: 'Look & feel?', sub: '',
        options: [
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans, on display', effect: function (b) { b.case = 'Tempered-glass case, RGB fans'; } },
          { label: 'Clean & quiet', sub: 'Minimal lighting, tucked under the desk', effect: function (b) { b.case = 'Minimal case, sound-dampened'; } },
          { label: 'Small form factor', sub: 'Compact, fits anywhere', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooler'; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Custom loop territory', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      budgetStep(['$900 – $1,300', '$1,300 – $2,000', '$2,000 – $3,000', '$3,000+'])
    ] },

    creative: { steps: [
      { question: "What's the main creative work?", sub: 'This sets the CPU/GPU balance.',
        options: [
          { label: 'Video editing', sub: 'Premiere, DaVinci, Final Cut', effect: function (b) { b.cpu = 'High-core-count CPU (fast timeline scrubbing & export)'; b.gpu = 'RTX 4070-class GPU, 12GB (GPU-accelerated export)'; } },
          { label: '3D & VFX', sub: 'Blender, Maya, Octane/Redshift', effect: function (b) { b.cpu = 'High-core-count CPU'; b.gpu = 'RTX 4080-class GPU, 16GB (fast GPU rendering)'; } },
          { label: 'Photo & design', sub: 'Lightroom, Photoshop, Illustrator', effect: function (b) { b.cpu = 'Fast 6–8 core CPU'; b.gpu = 'RTX 4060 Ti-class GPU, 16GB'; } },
          { label: 'Music production', sub: 'Low-latency audio, big sample libraries', effect: function (b) { b.cpu = 'High-frequency CPU (low audio latency)'; b.gpu = 'Entry workstation GPU'; } }
        ] },
      { question: 'How big are the files you work with?', sub: 'Sets how much memory (RAM) the build gets.',
        options: [
          { label: 'Normal', sub: 'Photos, short clips', effect: function (b) { b.ram = '32GB'; } },
          { label: 'Big', sub: '4K/8K footage, huge scenes', effect: function (b) { b.ram = '64GB'; } },
          { label: 'Massive', sub: 'Multi-track 8K, dense 3D scenes', effect: function (b) { b.ram = '128GB'; } }
        ] },
      { question: 'Storage — active work vs. archive?', sub: '',
        options: [
          { label: 'One fast project drive', sub: '1TB NVMe', effect: function (b) { b.storage = '1TB NVMe SSD'; } },
          { label: 'Active + archive', sub: '2TB NVMe + bulk storage', effect: function (b) { b.storage = '2TB NVMe SSD + bulk storage'; } },
          { label: 'Everything, always', sub: '4TB+ NVMe + RAID storage', effect: function (b) { b.storage = '4TB+ NVMe SSD + RAID storage'; } }
        ] },
      { question: 'Look & feel?', sub: '',
        options: [
          { label: 'Clean & professional', sub: 'Looks the part in a studio', effect: function (b) { b.case = 'Minimal workstation case'; } },
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans', effect: function (b) { b.case = 'Tempered-glass case, RGB fans'; } },
          { label: 'Small form factor', sub: 'Fits on a crowded desk', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooler'; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Long render sessions, max sustained clocks', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      budgetStep(['$1,500 – $2,200', '$2,200 – $3,500', '$3,500 – $5,000', '$5,000+'])
    ] },

    ai: { steps: [
      { question: "What's the biggest model you want to run locally?", sub: 'This is the biggest factor — how much GPU memory (VRAM) it takes to load and run the model.',
        options: [
          { label: 'Efficient everyday models', sub: '7B–14B-class — fast, general-purpose', effect: function (b) { b.gpu = 'RTX 4070 Ti-class GPU, 16GB VRAM'; } },
          { label: 'Flagship open-weight 70B-class', sub: 'Llama 3.3 70B, Qwen2.5 72B-class — near-frontier quality', effect: function (b) { b.gpu = 'Dual RTX 4090-class GPUs, 48GB combined VRAM'; b.notes.push('70B-class models need real VRAM — usually quantized or split across two GPUs'); } },
          { label: 'Frontier MoE giants', sub: 'DeepSeek-V3, Llama 3.1 405B-class — the actual frontier, self-hosted', effect: function (b) { b.gpu = 'Multi-GPU server build, 96GB+ VRAM (4× 24GB or more)'; b.notes.push("This is a serious multi-GPU build — we'll scope exact GPU count, power, and cooling on your consult"); } },
          { label: 'Not sure yet', sub: "We'll size it to whatever you end up running", effect: function (b) { b.gpu = 'RTX 4090-class GPU, 24GB VRAM (flexible headroom)'; } }
        ] },
      { question: 'How will you actually use it day to day?', sub: 'Agents and long-context work lean harder on CPU and memory than simple chat does.',
        options: [
          { label: 'Chat & document Q&A', sub: 'Ask questions, search internal docs', effect: function (b) { b.cpu = '8-core CPU'; b.ram = '32GB'; } },
          { label: 'Coding assistant', sub: 'Large context, big codebases', effect: function (b) { b.cpu = '12-core CPU'; b.ram = '64GB'; b.notes.push('Long-context coding wants RAM headroom and fast storage for repo indexing'); } },
          { label: 'Agents that use tools & chain tasks', sub: 'Browses, calls APIs, runs multi-step jobs', effect: function (b) { b.cpu = '12-core CPU'; b.ram = '64GB'; b.notes.push('Agent orchestration runs several processes at once — extra CPU cores keep it responsive'); } },
          { label: 'Multiple people or agents at once', sub: 'Concurrent users, or several agents in parallel', effect: function (b) { b.cpu = 'High-core-count server-class CPU'; b.ram = '128GB'; b.notes.push('Concurrency needs CPU, RAM, and VRAM headroom on top of the base model'); } }
        ] },
      { question: 'How much local model & data storage do you need?', sub: 'Flagship model weights alone can run 40–200GB+ each.',
        options: [
          { label: 'A focused library', sub: 'One or two models, core documents', effect: function (b) { b.storage = '2TB NVMe SSD'; } },
          { label: 'Growing steadily', sub: 'Several models plus a document library', effect: function (b) { b.storage = '4TB NVMe SSD'; } },
          { label: 'Everything the business has', sub: 'Large model library + network storage', effect: function (b) { b.storage = '8TB+ NVMe SSD + network storage'; } }
        ] },
      { question: 'Where does it live?', sub: '',
        options: [
          { label: 'Tucked away & quiet', sub: 'A closet or back office', effect: function (b) { b.case = 'Quiet, minimal server-style case'; } },
          { label: 'On display in the office', sub: '', effect: function (b) { b.case = 'Clean case, visible on-site'; } },
          { label: 'Rack-mountable', sub: 'Goes in a server rack', effect: function (b) { b.case = 'Rack-mountable chassis'; } }
        ] },
      { question: 'Cooling?', sub: 'Multi-GPU AI workloads run hot for long, sustained stretches.',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooling'; } },
          { label: 'Liquid — quieter under sustained load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Maximum sustained multi-GPU performance', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop and rack cooling options on the consult"); } }
        ] },
      budgetStep(['$2,000 – $3,500', '$3,500 – $6,000', '$6,000 – $12,000', '$12,000+'])
    ] },

    everyday: { steps: [
      { question: "What's it mainly for?", sub: '',
        options: [
          { label: 'Browsing, email, streaming video', sub: '', effect: function (b) { b.cpu = 'Efficient 6-core CPU'; b.gpu = 'Integrated graphics'; } },
          { label: 'Office work & video calls', sub: '', effect: function (b) { b.cpu = '6–8 core CPU'; b.gpu = 'Integrated graphics'; } },
          { label: 'Light photo editing & light gaming', sub: '', effect: function (b) { b.cpu = '8-core CPU'; b.gpu = 'Entry GPU, 8GB'; } }
        ] },
      { question: 'How many things do you usually have open at once?', sub: '',
        options: [
          { label: "A few tabs, that's it", sub: '', effect: function (b) { b.ram = '8GB'; } },
          { label: 'The usual mix', sub: 'Browser, email, a couple apps', effect: function (b) { b.ram = '16GB'; } },
          { label: 'I never close anything', sub: '', effect: function (b) { b.ram = '32GB'; } }
        ] },
      { question: 'Storage?', sub: '',
        options: [
          { label: 'Just the basics', sub: '512GB SSD', effect: function (b) { b.storage = '512GB SSD'; } },
          { label: 'A bit of room', sub: '1TB SSD', effect: function (b) { b.storage = '1TB SSD'; } },
          { label: 'Plenty of space', sub: '2TB SSD', effect: function (b) { b.storage = '2TB SSD'; } }
        ] },
      { question: 'Look & feel?', sub: '',
        options: [
          { label: "Doesn't matter, just works", sub: '', effect: function (b) { b.case = 'Minimal case'; } },
          { label: 'Clean & quiet', sub: '', effect: function (b) { b.case = 'Sound-dampened case'; } },
          { label: 'Small footprint', sub: 'Fits on the desk', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '',
        options: [
          { label: 'Standard is fine', sub: '', effect: function (b) { b.cooling = 'Standard air cooling'; } },
          { label: 'Whisper-quiet, please', sub: '', effect: function (b) { b.cooling = 'Whisper-quiet air cooling'; } }
        ] },
      budgetStep(['$500 – $800', '$800 – $1,200', '$1,200 – $1,800', '$1,800+'])
    ] }
  };

  // ---------- State ----------
  var state = { answers: [], build: null, trackSteps: null, finished: false };
  var prevBuild = null;

  function defaultBuild() {
    return { track: null, trackLabel: null, interest: null, cpu: null, gpu: null, ram: null, storage: null, cooling: null, case: null, budget: null, notes: [] };
  }

  function getCurrentStep() {
    if (state.answers.length === 0) return PURPOSE_STEP;
    return state.trackSteps[state.answers.length - 1];
  }

  // Rebuilds `build` from scratch by replaying every stored answer in order.
  // Keeps back/forward navigation trivially correct — no inverse-effect
  // functions to maintain, no drift between state.build and state.answers.
  function recompute() {
    var build = defaultBuild();
    if (state.answers.length > 0) {
      PURPOSE_STEP.options[state.answers[0]].effect(build);
    }
    var trackSteps = build.track ? TRACKS[build.track].steps : null;
    for (var i = 1; i < state.answers.length; i++) {
      trackSteps[i - 1].options[state.answers[i]].effect(build);
    }
    state.build = build;
    state.trackSteps = trackSteps;
    state.finished = !!(trackSteps && state.answers.length === trackSteps.length + 1);
  }

  function selectOption(index) {
    state.answers.push(index);
    recompute();
    render();
  }

  function goBack() {
    if (!state.answers.length) return;
    state.answers.pop();
    recompute();
    render();
  }

  function restart() {
    state.answers = [];
    recompute();
    render();
  }

  // ---------- Rendering ----------
  function render() {
    renderPanel();
    renderRig();
  }

  function renderPanel() {
    if (state.finished) return renderSummaryPanel();
    var step = getCurrentStep();
    var total = state.trackSteps ? state.trackSteps.length + 1 : null;
    var stepNum = state.answers.length + 1;
    var pct = total ? Math.round((state.answers.length / total) * 100) : 8;

    panelEl.innerHTML =
      '<div class="builder-progress">' +
        '<div class="builder-progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div>' +
        '<p class="builder-progress-label">' + (total ? 'Step ' + stepNum + ' of ' + total : 'Step ' + stepNum) + '</p>' +
      '</div>' +
      '<h2 class="builder-question">' + escapeHtml(step.question) + '</h2>' +
      (step.sub ? '<p class="builder-sub">' + escapeHtml(step.sub) + '</p>' : '') +
      '<div class="builder-options" role="list">' +
        step.options.map(function (opt, i) {
          return '<button type="button" class="builder-option" data-index="' + i + '">' +
            '<span class="builder-option-label">' + escapeHtml(opt.label) + '</span>' +
            (opt.sub ? '<span class="builder-option-sub">' + escapeHtml(opt.sub) + '</span>' : '') +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="builder-nav">' +
        (state.answers.length ? '<button type="button" class="btn btn-ghost btn-sm" id="builder-back">&larr; Back</button>' : '<span></span>') +
        '<button type="button" class="text-link builder-restart" id="builder-restart-inline">Start over</button>' +
      '</div>';

    var opts = panelEl.querySelectorAll('.builder-option');
    opts.forEach(function (btn) {
      btn.addEventListener('click', function () { selectOption(Number(btn.getAttribute('data-index'))); });
    });
    var back = document.getElementById('builder-back');
    if (back) back.addEventListener('click', goBack);
    document.getElementById('builder-restart-inline').addEventListener('click', restart);
  }

  function ctaHref(b) {
    var parts = [b.cpu, b.gpu, b.ram ? b.ram + ' RAM' : null, b.storage, b.cooling, b.case].filter(Boolean);
    var summary = 'Sandbox build (' + b.trackLabel + '): ' + parts.join(' · ') + '. Target budget: ' + (b.budget || 'flexible') + '.';
    var params = new URLSearchParams();
    if (b.interest) params.set('interest', b.interest);
    params.set('build', summary);
    return '/?' + params.toString() + '#audit';
  }

  function renderSummaryPanel() {
    var b = state.build;
    panelEl.innerHTML =
      '<div class="builder-progress">' +
        '<div class="builder-progress-bar"><span style="width:100%"></span></div>' +
        '<p class="builder-progress-label">Build complete</p>' +
      '</div>' +
      '<h2 class="builder-question">Here’s where you landed: a ' + escapeHtml(b.trackLabel) + '.</h2>' +
      '<p class="builder-sub">This is a starting point, not a final spec sheet or invoice. Real parts, current pricing, and vendor options get locked in on your free consultation — your build so far is in the terminal panel next to these questions.</p>' +
      '<div class="builder-cta-row">' +
        '<a class="btn btn-primary" href="' + ctaHref(b) + '">Get this build quoted <span aria-hidden="true">&rarr;</span></a>' +
        '<button type="button" class="btn btn-ghost" id="builder-restart">Start a new build</button>' +
      '</div>' +
      '<div class="builder-nav">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="builder-back">&larr; Back</button>' +
        '<span></span>' +
      '</div>';
    document.getElementById('builder-restart').addEventListener('click', restart);
    document.getElementById('builder-back').addEventListener('click', goBack);
  }

  function renderRig() {
    var b = state.build;
    var slots = [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'Memory'], ['storage', 'Storage'], ['cooling', 'Cooling'], ['case', 'Case']];
    var lines = slots.map(function (pair) {
      var key = pair[0], label = pair[1];
      var val = b[key];
      var changed = prevBuild && prevBuild[key] !== val && val;
      var cls = 'rig-line' + (val ? ' is-set' : '') + (changed ? ' just-set' : '');
      return '<p class="t-line ' + cls + '"><span class="t-prompt">' + label + '</span><span class="rig-value">' + (val ? escapeHtml(val) : '— pending —') + '</span></p>';
    }).join('');
    var budgetLine = b.budget ? '<p class="t-line t-result">Target: ' + escapeHtml(b.budget) + '</p>' : '';
    var notes = b.notes.length ? '<div class="rig-notes">' + b.notes.map(function (n) { return '<p>&middot; ' + escapeHtml(n) + '</p>'; }).join('') + '</div>' : '';
    var label = (b.trackLabel || 'new-build').toLowerCase().replace(/\s+/g, '-');

    rigEl.innerHTML =
      '<div class="terminal">' +
        '<div class="terminal-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="terminal-label">' + escapeHtml(label) + '.cfg</span></div>' +
        '<div class="terminal-body">' + lines + budgetLine + '</div>' +
        notes +
      '</div>';

    prevBuild = b;
  }

  // ---------- Init ----------
  recompute();

  // Deep-link support: /pc-builder?track=gaming skips straight past the
  // purpose question. Used by the "Start this build" links on the homepage.
  var presetTrack = new URLSearchParams(location.search).get('track');
  var presetIndex = presetTrack ? PURPOSE_STEP.options.findIndex(function (o) { return o.key === presetTrack; }) : -1;
  if (presetIndex > -1) {
    selectOption(presetIndex);
  } else {
    render();
  }
})();
