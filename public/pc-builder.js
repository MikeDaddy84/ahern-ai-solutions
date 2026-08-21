// Ahern AI Solutions — interactive PC Builder sandbox.
// Vanilla JS, data-driven quiz that assembles a possible build live as the
// visitor answers plain-language questions. No live pricing or vendor
// catalog yet (see README roadmap notes) — budgets are ballpark bands, and
// every build ends with "confirm the real spec on your free consult."
//
// The answered path is the single source of truth and it lives in the URL
// hash (#b=ai.1.2.0), so browser back/forward, refresh, and sharing a
// finished build all work without extra state to keep in sync.
(function () {
  var panelEl = document.getElementById('builder-panel');
  var rigEl = document.getElementById('builder-rig');
  var liveEl = document.getElementById('builder-live');
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
      short: 'Budget',
      options: bands.map(function (label, i) {
        return { label: label, sub: subs[i], effect: function (b) { b.budget = label; } };
      })
    };
  }

  var TRACKS = {
    gaming: { steps: [
      { question: "What's the gaming target?", sub: 'This drives the GPU — the single biggest factor in how a game feels.', short: 'Gaming target',
        options: [
          { label: 'Competitive & high fps', sub: '1080p–1440p, maxed-out frame rate', effect: function (b) { b.gpu = 'RTX 4060 Ti / RX 7700 XT-class, 12–16GB'; b.cpu = 'High-frequency 6-core CPU (fast per-core speed for fps)'; } },
          { label: 'Cinematic single-player', sub: '1440p, high detail', effect: function (b) { b.gpu = 'RTX 4070 Ti-class, 12–16GB'; b.cpu = '8-core CPU, balanced'; } },
          { label: 'Go big — 4K', sub: '4K, everything maxed', effect: function (b) { b.gpu = 'RTX 4080 / 4090-class, 16GB+'; b.cpu = 'High-core-count CPU to keep up'; } },
          { label: 'Virtual reality', sub: 'Smooth, no-compromise VR', effect: function (b) { b.gpu = 'RTX 4070 Ti SUPER / 4080-class, 16GB+ (VR-ready)'; b.cpu = '8-core CPU'; b.notes.push('VR-ready GPU + fast USB for the headset'); } }
        ] },
      { question: 'Planning to stream or record while you play?', sub: 'Encoding while gaming benefits from extra CPU headroom.', short: 'Streaming',
        options: [
          { label: 'Yes — streaming to Twitch/YouTube', sub: 'Live or recorded, on top of playing', effect: function (b) { b.notes.push('Extra CPU headroom reserved for streaming/encoding'); } },
          { label: 'No, just playing', sub: '', effect: function () {} }
        ] },
      { question: 'How many things do you usually have open at once?', sub: 'Sets how much memory (RAM) the build gets.', short: 'Multitasking',
        options: [
          { label: 'Just the game', sub: '16GB is plenty', effect: function (b) { b.ram = '16GB'; } },
          { label: 'Game + Discord + browser + Spotify', sub: 'The realistic default', effect: function (b) { b.ram = '32GB'; } },
          { label: 'I basically never close anything', sub: 'Heavy multitasker', effect: function (b) { b.ram = '64GB'; } }
        ] },
      { question: 'Storage — what fits your library?', sub: '', short: 'Storage',
        options: [
          { label: 'One fast drive is plenty', sub: '1TB NVMe SSD', effect: function (b) { b.storage = '1TB NVMe SSD'; } },
          { label: 'Give me room to grow', sub: '2TB NVMe SSD', effect: function (b) { b.storage = '2TB NVMe SSD'; } },
          { label: 'I hoard everything', sub: '4TB+ NVMe + bulk storage', effect: function (b) { b.storage = '4TB+ NVMe SSD + bulk HDD'; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans, on display', effect: function (b) { b.case = 'Tempered-glass case, RGB fans'; } },
          { label: 'Clean & quiet', sub: 'Minimal lighting, tucked under the desk', effect: function (b) { b.case = 'Minimal case, sound-dampened'; } },
          { label: 'Small form factor', sub: 'Compact, fits anywhere', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooler'; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Custom loop territory', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      budgetStep(['$900 – $1,300', '$1,300 – $2,000', '$2,000 – $3,000', '$3,000+'])
    ] },

    creative: { steps: [
      { question: "What's the main creative work?", sub: 'This sets the CPU/GPU balance.', short: 'Creative work',
        options: [
          { label: 'Video editing', sub: 'Premiere, DaVinci, Final Cut', effect: function (b) { b.cpu = 'High-core-count CPU (fast timeline scrubbing & export)'; b.gpu = 'RTX 4070-class GPU, 12GB (GPU-accelerated export)'; } },
          { label: '3D & VFX', sub: 'Blender, Maya, Octane/Redshift', effect: function (b) { b.cpu = 'High-core-count CPU'; b.gpu = 'RTX 4080-class GPU, 16GB (fast GPU rendering)'; } },
          { label: 'Photo & design', sub: 'Lightroom, Photoshop, Illustrator', effect: function (b) { b.cpu = 'Fast 6–8 core CPU'; b.gpu = 'RTX 4060 Ti-class GPU, 16GB'; } },
          { label: 'Music production', sub: 'Low-latency audio, big sample libraries', effect: function (b) { b.cpu = 'High-frequency CPU (low audio latency)'; b.gpu = 'Entry workstation GPU'; } }
        ] },
      { question: 'How big are the files you work with?', sub: 'Sets how much memory (RAM) the build gets.', short: 'File sizes',
        options: [
          { label: 'Normal', sub: 'Photos, short clips', effect: function (b) { b.ram = '32GB'; } },
          { label: 'Big', sub: '4K/8K footage, huge scenes', effect: function (b) { b.ram = '64GB'; } },
          { label: 'Massive', sub: 'Multi-track 8K, dense 3D scenes', effect: function (b) { b.ram = '128GB'; } }
        ] },
      { question: 'Storage — active work vs. archive?', sub: '', short: 'Storage',
        options: [
          { label: 'One fast project drive', sub: '1TB NVMe', effect: function (b) { b.storage = '1TB NVMe SSD'; } },
          { label: 'Active + archive', sub: '2TB NVMe + bulk storage', effect: function (b) { b.storage = '2TB NVMe SSD + bulk storage'; } },
          { label: 'Everything, always', sub: '4TB+ NVMe + RAID storage', effect: function (b) { b.storage = '4TB+ NVMe SSD + RAID storage'; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: 'Clean & professional', sub: 'Looks the part in a studio', effect: function (b) { b.case = 'Minimal workstation case'; } },
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans', effect: function (b) { b.case = 'Tempered-glass case, RGB fans'; } },
          { label: 'Small form factor', sub: 'Fits on a crowded desk', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooler'; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Long render sessions, max sustained clocks', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      budgetStep(['$1,500 – $2,200', '$2,200 – $3,500', '$3,500 – $5,000', '$5,000+'])
    ] },

    ai: { steps: [
      { question: "What's the biggest model you want to run locally?", sub: 'This is the biggest factor — how much GPU memory (VRAM) it takes to load and run the model.', short: 'Model size',
        options: [
          { label: 'Efficient everyday models', sub: '7B–14B-class — fast, general-purpose', effect: function (b) { b.gpu = 'RTX 4070 Ti-class GPU, 16GB VRAM'; } },
          { label: 'Flagship open-weight 70B-class', sub: 'Llama 3.3 70B, Qwen2.5 72B-class — near-frontier quality', effect: function (b) { b.gpu = 'Dual RTX 4090-class GPUs, 48GB combined VRAM'; b.notes.push('70B-class models need real VRAM — usually quantized or split across two GPUs'); } },
          { label: 'Frontier MoE giants', sub: 'DeepSeek-V3, Llama 3.1 405B-class — the actual frontier, self-hosted', effect: function (b) { b.gpu = 'Multi-GPU server build, 96GB+ VRAM (4× 24GB or more)'; b.notes.push("This is a serious multi-GPU build — we'll scope exact GPU count, power, and cooling on your consult"); } },
          { label: 'Not sure yet', sub: "We'll size it to whatever you end up running", effect: function (b) { b.gpu = 'RTX 4090-class GPU, 24GB VRAM (flexible headroom)'; } }
        ] },
      { question: 'How will you actually use it day to day?', sub: 'Agents and long-context work lean harder on CPU and memory than simple chat does.', short: 'Daily use',
        options: [
          { label: 'Chat & document Q&A', sub: 'Ask questions, search internal docs', effect: function (b) { b.cpu = '8-core CPU'; b.ram = '32GB'; } },
          { label: 'Coding assistant', sub: 'Large context, big codebases', effect: function (b) { b.cpu = '12-core CPU'; b.ram = '64GB'; b.notes.push('Long-context coding wants RAM headroom and fast storage for repo indexing'); } },
          { label: 'Agents that use tools & chain tasks', sub: 'Browses, calls APIs, runs multi-step jobs', effect: function (b) { b.cpu = '12-core CPU'; b.ram = '64GB'; b.notes.push('Agent orchestration runs several processes at once — extra CPU cores keep it responsive'); } },
          { label: 'Multiple people or agents at once', sub: 'Concurrent users, or several agents in parallel', effect: function (b) { b.cpu = 'High-core-count server-class CPU'; b.ram = '128GB'; b.notes.push('Concurrency needs CPU, RAM, and VRAM headroom on top of the base model'); } }
        ] },
      { question: 'How much local model & data storage do you need?', sub: 'Flagship model weights alone can run 40–200GB+ each.', short: 'Storage',
        options: [
          { label: 'A focused library', sub: 'One or two models, core documents', effect: function (b) { b.storage = '2TB NVMe SSD'; } },
          { label: 'Growing steadily', sub: 'Several models plus a document library', effect: function (b) { b.storage = '4TB NVMe SSD'; } },
          { label: 'Everything the business has', sub: 'Large model library + network storage', effect: function (b) { b.storage = '8TB+ NVMe SSD + network storage'; } }
        ] },
      { question: 'Where does it live?', sub: '', short: 'Location',
        options: [
          { label: 'Tucked away & quiet', sub: 'A closet or back office', effect: function (b) { b.case = 'Quiet, minimal server-style case'; } },
          { label: 'On display in the office', sub: '', effect: function (b) { b.case = 'Clean case, visible on-site'; } },
          { label: 'Rack-mountable', sub: 'Goes in a server rack', effect: function (b) { b.case = 'Rack-mountable chassis'; } }
        ] },
      { question: 'Cooling?', sub: 'Multi-GPU AI workloads run hot for long, sustained stretches.', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = 'High-performance air cooling'; } },
          { label: 'Liquid — quieter under sustained load', sub: '240–360mm AIO', effect: function (b) { b.cooling = '240–360mm AIO liquid cooler'; } },
          { label: 'Push it — extreme cooling', sub: 'Maximum sustained multi-GPU performance', effect: function (b) { b.cooling = 'Custom liquid loop (extreme cooling)'; b.notes.push("Extreme cooling — we'll walk through custom-loop and rack cooling options on the consult"); } }
        ] },
      budgetStep(['$2,000 – $3,500', '$3,500 – $6,000', '$6,000 – $12,000', '$12,000+'])
    ] },

    everyday: { steps: [
      { question: "What's it mainly for?", sub: '', short: 'Main use',
        options: [
          { label: 'Browsing, email, streaming video', sub: '', effect: function (b) { b.cpu = 'Efficient 6-core CPU'; b.gpu = 'Integrated graphics'; } },
          { label: 'Office work & video calls', sub: '', effect: function (b) { b.cpu = '6–8 core CPU'; b.gpu = 'Integrated graphics'; } },
          { label: 'Light photo editing & light gaming', sub: '', effect: function (b) { b.cpu = '8-core CPU'; b.gpu = 'Entry GPU, 8GB'; } }
        ] },
      { question: 'How many things do you usually have open at once?', sub: '', short: 'Multitasking',
        options: [
          { label: "A few tabs, that's it", sub: '', effect: function (b) { b.ram = '8GB'; } },
          { label: 'The usual mix', sub: 'Browser, email, a couple apps', effect: function (b) { b.ram = '16GB'; } },
          { label: 'I never close anything', sub: '', effect: function (b) { b.ram = '32GB'; } }
        ] },
      { question: 'Storage?', sub: '', short: 'Storage',
        options: [
          { label: 'Just the basics', sub: '512GB SSD', effect: function (b) { b.storage = '512GB SSD'; } },
          { label: 'A bit of room', sub: '1TB SSD', effect: function (b) { b.storage = '1TB SSD'; } },
          { label: 'Plenty of space', sub: '2TB SSD', effect: function (b) { b.storage = '2TB SSD'; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: "Doesn't matter, just works", sub: '', effect: function (b) { b.case = 'Minimal case'; } },
          { label: 'Clean & quiet', sub: '', effect: function (b) { b.case = 'Sound-dampened case'; } },
          { label: 'Small footprint', sub: 'Fits on the desk', effect: function (b) { b.case = 'Compact SFF case'; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Standard is fine', sub: '', effect: function (b) { b.cooling = 'Standard air cooling'; } },
          { label: 'Whisper-quiet, please', sub: '', effect: function (b) { b.cooling = 'Whisper-quiet air cooling'; } }
        ] },
      budgetStep(['$500 – $800', '$800 – $1,200', '$1,200 – $1,800', '$1,800+'])
    ] }
  };

  var SLOTS = [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'Memory'], ['storage', 'Storage'], ['cooling', 'Cooling'], ['case', 'Case']];
  var PURPOSE_SHORT = 'Build type';

  // ---------- State ----------
  // `answers` is where the visitor is now; `recalled` remembers the deepest
  // path they've taken, so stepping back can show what they picked before.
  var state = { answers: [], build: null, trackSteps: null, finished: false };
  var recalled = [];
  var prevBuild = null;
  var prevFilled = null;
  var pushDepth = 0;   // how many of our own history entries sit behind us
  var rigOpen = false; // mobile: is the build panel expanded

  function defaultBuild() {
    return { track: null, trackLabel: null, interest: null, cpu: null, gpu: null, ram: null, storage: null, cooling: null, case: null, budget: null, notes: [] };
  }

  function stepAt(i) {
    return i === 0 ? PURPOSE_STEP : state.trackSteps[i - 1];
  }

  function getCurrentStep() {
    return stepAt(state.answers.length);
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

  // ---------- URL <-> answers ----------
  // #b=gaming.2.1.0 — track key first so a shared link stays readable, then
  // one index per answered question. Anything malformed truncates cleanly
  // rather than throwing, so even a mangled link lands on a usable step.
  function encodeAnswers(answers) {
    if (!answers.length) return '';
    return [PURPOSE_STEP.options[answers[0]].key].concat(answers.slice(1)).join('.');
  }

  function decodeAnswers(str) {
    if (!str) return [];
    var parts = String(str).split('.');
    var first = -1;
    for (var k = 0; k < PURPOSE_STEP.options.length; k++) {
      if (PURPOSE_STEP.options[k].key === parts[0]) first = k;
    }
    if (first < 0) return [];
    var answers = [first];
    var steps = TRACKS[parts[0]].steps;
    for (var i = 1; i < parts.length && i - 1 < steps.length; i++) {
      var n = parseInt(parts[i], 10);
      if (!(n >= 0 && n < steps[i - 1].options.length)) break;
      answers.push(n);
    }
    return answers;
  }

  function hashAnswers() {
    var m = /(?:^|[#&])b=([^&]*)/.exec(location.hash || '');
    return decodeAnswers(m ? decodeURIComponent(m[1]) : '');
  }

  function urlFor(answers) {
    var enc = encodeAnswers(answers);
    return location.pathname + (enc ? '#b=' + enc : '#start');
  }

  function isPrefix(shortArr, longArr) {
    if (shortArr.length > longArr.length) return false;
    for (var i = 0; i < shortArr.length; i++) if (shortArr[i] !== longArr[i]) return false;
    return true;
  }

  // The one path every navigation goes through. `mode` is 'push', 'replace',
  // or null when the browser already moved us (popstate).
  function applyAnswers(answers, mode, focus) {
    state.answers = answers.slice();
    if (!isPrefix(state.answers, recalled)) recalled = state.answers.slice();
    recompute();
    if (mode === 'push') {
      history.pushState({ builder: true }, '', urlFor(state.answers));
      pushDepth++;
    } else if (mode === 'replace') {
      history.replaceState({ builder: true }, '', urlFor(state.answers));
    }
    render(focus);
  }

  function selectOption(index) {
    var before = state.build;
    // On mobile the build panel overlays the questions, so answering closes
    // it again; the part count in the collapsed bar still updates live.
    rigOpen = false;
    applyAnswers(state.answers.concat([index]), 'push', true);
    announceChange(before, state.build);
  }

  function goBack() {
    if (!state.answers.length) return;
    // Unwind a real history entry when we have one, so this button and the
    // browser's own Back button stay in step with each other.
    if (pushDepth > 0) { history.back(); return; }
    applyAnswers(state.answers.slice(0, -1), 'replace', true);
  }

  function jumpTo(stepIndex) {
    if (stepIndex >= state.answers.length) return;
    applyAnswers(state.answers.slice(0, stepIndex), 'push', true);
  }

  function restart() {
    recalled = [];
    prevBuild = null;
    applyAnswers([], 'push', true);
  }

  window.addEventListener('popstate', function () {
    var next = hashAnswers();
    if (next.length < state.answers.length) pushDepth = Math.max(0, pushDepth - 1);
    else if (next.length > state.answers.length) pushDepth++;
    applyAnswers(next, null, true);
  });

  // ---------- Announcements ----------
  // Only what actually changed, so screen readers hear "Build updated. GPU:
  // ..." instead of the whole spec re-read on every single answer.
  function announceChange(before, after) {
    if (!liveEl) return;
    var changes = [];
    SLOTS.forEach(function (pair) {
      var key = pair[0];
      if (after[key] && (!before || before[key] !== after[key])) changes.push(pair[1] + ': ' + after[key]);
    });
    if (after.budget && (!before || before.budget !== after.budget)) changes.push('Target budget: ' + after.budget);
    liveEl.textContent = changes.length ? 'Build updated. ' + changes.join('. ') + '.' : '';
  }

  // ---------- Rendering ----------
  function render(focus) {
    renderPanel();
    renderRig();
    if (focus) focusQuestion();
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Rebuilding the panel throws focus to <body>, which strands keyboard and
  // screen-reader users at the top of the document on every question. Put
  // them on the new question instead.
  function focusQuestion() {
    var h = panelEl.querySelector('.builder-question');
    if (!h) return;
    h.focus({ preventScroll: true });
    var rect = panelEl.getBoundingClientRect();
    if (rect.top < 80 || rect.top > window.innerHeight - 160) {
      window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function trailHtml() {
    if (!state.answers.length) return '';
    var chips = state.answers.map(function (choice, i) {
      var step = stepAt(i);
      var label = step.options[choice].label;
      var short = i === 0 ? PURPOSE_SHORT : (step.short || 'Step ' + (i + 1));
      return '<li><button type="button" class="builder-chip" data-step="' + i + '" ' +
        'aria-label="' + escapeHtml('Change your answer to: ' + step.question + ' — currently ' + label) + '">' +
        '<span class="builder-chip-key">' + escapeHtml(short) + '</span>' +
        '<span class="builder-chip-value">' + escapeHtml(label) + '</span>' +
      '</button></li>';
    }).join('');
    return '<nav class="builder-trail-wrap" aria-label="Your answers so far">' +
      '<ol class="builder-trail">' + chips + '</ol>' +
    '</nav>';
  }

  function progressHtml(pct, label) {
    return '<div class="builder-progress">' +
      '<div class="builder-progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Build progress"><span style="width:' + pct + '%"></span></div>' +
      '<p class="builder-progress-label">' + escapeHtml(label) + '</p>' +
    '</div>';
  }

  function renderPanel() {
    if (state.finished) return renderSummaryPanel();
    var step = getCurrentStep();
    var total = state.trackSteps ? state.trackSteps.length + 1 : null;
    var stepNum = state.answers.length + 1;
    var pct = total ? Math.round((state.answers.length / total) * 100) : 4;
    var prior = recalled.length > state.answers.length ? recalled[state.answers.length] : null;

    panelEl.innerHTML =
      progressHtml(pct, total ? 'Step ' + stepNum + ' of ' + total : 'Step ' + stepNum) +
      trailHtml() +
      '<h2 class="builder-question" id="builder-question" tabindex="-1">' + escapeHtml(step.question) + '</h2>' +
      (step.sub ? '<p class="builder-sub">' + escapeHtml(step.sub) + '</p>' : '') +
      '<div class="builder-options" role="group" aria-labelledby="builder-question">' +
        step.options.map(function (opt, i) {
          var isPrior = prior === i;
          return '<button type="button" class="builder-option' + (isPrior ? ' is-prior' : '') + '" data-index="' + i + '"' +
            (isPrior ? ' aria-describedby="builder-prior-note"' : '') + '>' +
            '<span class="builder-option-key" aria-hidden="true">' + (i + 1) + '</span>' +
            '<span class="builder-option-text">' +
              '<span class="builder-option-label">' + escapeHtml(opt.label) + '</span>' +
              (opt.sub ? '<span class="builder-option-sub">' + escapeHtml(opt.sub) + '</span>' : '') +
            '</span>' +
            (isPrior ? '<span class="builder-option-flag">Your last pick</span>' : '') +
          '</button>';
        }).join('') +
      '</div>' +
      (prior !== null ? '<p class="sr-only" id="builder-prior-note">This is the answer you chose here previously.</p>' : '') +
      '<div class="builder-nav">' +
        (state.answers.length
          ? '<button type="button" class="btn btn-ghost btn-sm" id="builder-back"><span aria-hidden="true">&larr;</span> Back</button>'
          : '<p class="builder-hint">Tip: press <kbd>1</kbd>&ndash;<kbd>' + step.options.length + '</kbd> to answer</p>') +
        (state.answers.length ? '<button type="button" class="builder-linkish" id="builder-restart-inline">Start over</button>' : '<span></span>') +
      '</div>';

    wirePanel();
  }

  function specRowsHtml(b) {
    return SLOTS.filter(function (pair) { return b[pair[0]]; }).map(function (pair) {
      return '<div class="spec-row"><dt>' + escapeHtml(pair[1]) + '</dt><dd>' + escapeHtml(b[pair[0]]) + '</dd></div>';
    }).join('') +
    (b.budget ? '<div class="spec-row spec-row-budget"><dt>Target budget</dt><dd>' + escapeHtml(b.budget) + '</dd></div>' : '');
  }

  function renderSummaryPanel() {
    var b = state.build;
    panelEl.innerHTML =
      progressHtml(100, 'Build complete') +
      trailHtml() +
      '<h2 class="builder-question" id="builder-question" tabindex="-1">Your ' + escapeHtml(b.trackLabel) + ', on paper.</h2>' +
      '<p class="builder-sub">A starting point, not a quote. Exact parts, current pricing, and vendor options get locked in on your free consultation.</p>' +
      '<div class="spec-sheet">' +
        '<dl class="spec-list">' + specRowsHtml(b) + '</dl>' +
        (b.notes.length
          ? '<div class="spec-notes"><p class="spec-notes-title">Worth knowing</p><ul>' +
              b.notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') +
            '</ul></div>'
          : '') +
      '</div>' +
      '<div class="builder-cta-row">' +
        '<a class="btn btn-primary" href="' + escapeHtml(ctaHref(b)) + '">Get this build quoted <span aria-hidden="true">&rarr;</span></a>' +
        '<button type="button" class="btn btn-ghost" data-copy="spec">Copy spec</button>' +
        '<button type="button" class="btn btn-ghost" data-copy="link">Copy link</button>' +
      '</div>' +
      '<p class="builder-copy-status" id="builder-copy-status" role="status"></p>' +
      '<div class="builder-nav">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="builder-back"><span aria-hidden="true">&larr;</span> Change last answer</button>' +
        '<button type="button" class="builder-linkish" id="builder-restart-inline">Start a new build</button>' +
      '</div>';

    wirePanel();
  }

  function wirePanel() {
    panelEl.querySelectorAll('.builder-option').forEach(function (btn) {
      btn.addEventListener('click', function () { selectOption(Number(btn.getAttribute('data-index'))); });
    });
    panelEl.querySelectorAll('.builder-chip').forEach(function (btn) {
      btn.addEventListener('click', function () { jumpTo(Number(btn.getAttribute('data-step'))); });
    });
    panelEl.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleCopy(btn.getAttribute('data-copy')); });
    });
    var back = document.getElementById('builder-back');
    if (back) back.addEventListener('click', goBack);
    var restartBtn = document.getElementById('builder-restart-inline');
    if (restartBtn) restartBtn.addEventListener('click', restart);
  }

  // ---------- Share / copy ----------
  function shareUrl() {
    return location.origin + urlFor(state.answers);
  }

  function pad(label) {
    var s = label + ':';
    while (s.length < 10) s += ' ';
    return s;
  }

  function specText(b) {
    var lines = ['Ahern AI Solutions — PC build sandbox', b.trackLabel, ''];
    SLOTS.forEach(function (pair) {
      if (b[pair[0]]) lines.push(pad(pair[1]) + b[pair[0]]);
    });
    if (b.budget) lines.push(pad('Budget') + b.budget);
    if (b.notes.length) {
      lines.push('', 'Worth knowing');
      b.notes.forEach(function (n) { lines.push('  - ' + n); });
    }
    lines.push('', 'Starting point only — final parts, pricing, and vendors are confirmed on a free consultation.', shareUrl());
    return lines.join('\n');
  }

  function handleCopy(kind) {
    var text = kind === 'link' ? shareUrl() : specText(state.build);
    copyText(text).then(function (ok) {
      var status = document.getElementById('builder-copy-status');
      if (!status) return;
      status.textContent = ok
        ? (kind === 'link' ? 'Link copied — reopen this exact build any time.' : 'Spec copied to your clipboard.')
        : 'Your browser blocked copying — the spec is listed above.';
      status.classList.add('is-visible');
      clearTimeout(handleCopy._t);
      handleCopy._t = setTimeout(function () { status.classList.remove('is-visible'); }, 4000);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function ctaHref(b) {
    var parts = [b.cpu, b.gpu, b.ram ? b.ram + ' RAM' : null, b.storage, b.cooling, b.case].filter(Boolean);
    var summary = 'Sandbox build (' + b.trackLabel + '): ' + parts.join(' · ') + '. Target budget: ' + (b.budget || 'flexible') + '. Full config: ' + shareUrl();
    var params = new URLSearchParams();
    if (b.interest) params.set('interest', b.interest);
    params.set('build', summary);
    return '/?' + params.toString() + '#audit';
  }

  // ---------- Build panel ("the rig") ----------
  function renderRig() {
    var b = state.build;
    var filled = 0;
    var lines = SLOTS.map(function (pair) {
      var key = pair[0], label = pair[1];
      var val = b[key];
      if (val) filled++;
      var changed = prevBuild && prevBuild[key] !== val && val;
      var cls = 'rig-line' + (val ? ' is-set' : '') + (changed ? ' just-set' : '');
      return '<p class="t-line ' + cls + '"><span class="t-prompt">' + label + '</span><span class="rig-value">' + (val ? escapeHtml(val) : 'pending') + '</span></p>';
    }).join('');
    var budgetLine = b.budget ? '<p class="t-line t-result">Target: ' + escapeHtml(b.budget) + '</p>' : '';
    var notes = b.notes.length ? '<div class="rig-notes">' + b.notes.map(function (n) { return '<p>&middot; ' + escapeHtml(n) + '</p>'; }).join('') + '</div>' : '';
    var label = (b.trackLabel || 'new-build').toLowerCase().replace(/\s+/g, '-');
    var count = filled + ' of ' + SLOTS.length + ' parts';

    rigEl.className = 'builder-rig' + (rigOpen ? ' is-open' : '');
    rigEl.innerHTML =
      '<button type="button" class="rig-toggle" id="rig-toggle" aria-expanded="' + (rigOpen ? 'true' : 'false') + '" aria-controls="rig-terminal">' +
        '<span class="rig-toggle-label">Your build</span>' +
        '<span class="rig-toggle-count">' + escapeHtml(count) + '</span>' +
        '<span class="rig-toggle-chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="terminal" id="rig-terminal">' +
        '<div class="terminal-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="terminal-label">' + escapeHtml(label) + '.cfg &middot; ' + escapeHtml(count) + '</span></div>' +
        '<div class="terminal-body">' + lines + budgetLine + '</div>' +
        notes +
      '</div>';

    var toggle = document.getElementById('rig-toggle');
    toggle.addEventListener('click', function () {
      rigOpen = !rigOpen;
      rigEl.classList.toggle('is-open', rigOpen);
      toggle.setAttribute('aria-expanded', rigOpen ? 'true' : 'false');
    });
    // Collapsed on mobile, the bar is the only signal that the build moved.
    if (prevFilled !== null && filled !== prevFilled) {
      toggle.classList.add('is-updated');
      setTimeout(function () { toggle.classList.remove('is-updated'); }, 1000);
    }

    prevFilled = filled;
    prevBuild = b;
  }

  // ---------- Keyboard ----------
  // Number keys answer, arrows move between options, Backspace steps back.
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

    var options = Array.prototype.slice.call(panelEl.querySelectorAll('.builder-option'));

    if (/^[1-9]$/.test(e.key) && options.length) {
      var idx = Number(e.key) - 1;
      if (idx < options.length) { e.preventDefault(); selectOption(idx); }
      return;
    }
    if (e.key === 'Backspace' && state.answers.length) { e.preventDefault(); goBack(); return; }
    if (!options.length) return;

    var pos = options.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      options[pos < 0 ? 0 : (pos + 1) % options.length].focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      options[pos < 0 ? options.length - 1 : (pos - 1 + options.length) % options.length].focus();
    }
  });

  // ---------- Init ----------
  // Priority: a shared or bookmarked #b= path, then the homepage's ?track=
  // deep links, then a fresh start. Either way the hash becomes the single
  // source of truth before the first render.
  var initial = hashAnswers();
  if (!initial.length) {
    var presetTrack = new URLSearchParams(location.search).get('track');
    for (var p = 0; presetTrack && p < PURPOSE_STEP.options.length; p++) {
      if (PURPOSE_STEP.options[p].key === presetTrack) { initial = [p]; break; }
    }
  }
  recalled = initial.slice();
  applyAnswers(initial, 'replace', false);
})();
