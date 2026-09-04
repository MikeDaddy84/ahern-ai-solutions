// Ahern AI — interactive PC Builder sandbox.
// Vanilla JS, data-driven quiz that assembles a possible build live as the
// visitor answers plain-language questions.
//
// There's deliberately no budget question. Asking for a budget up front makes
// people guess at a number before they know what they want, anchors them low,
// and hides the options that would have taught them what things cost. Instead
// the estimate updates as they answer, so changing an answer visibly moves the
// number — the budget conversation happens continuously instead of as a gate.
//
// Part labels and every dollar figure live in pricing.js, not here.
//
// The answered path is the single source of truth and it lives in the URL
// hash (#b=ai.1.2.0), so browser back/forward, refresh, and sharing a
// finished build all work without extra state to keep in sync.
(function () {
  var panelEl = document.getElementById('builder-panel');
  var rigEl = document.getElementById('builder-rig');
  var liveEl = document.getElementById('builder-live');
  if (!panelEl || !rigEl) return;

  var PRICING = window.AHERN_PRICING;
  if (!PRICING) {
    panelEl.innerHTML = '<p class="builder-sub">The builder could not load its pricing data. ' +
      '<a class="text-link" href="/#audit">Book a free consultation</a> and we\'ll spec it with you directly.</p>';
    return;
  }

  var P = PRICING.parts;
  var CPU = P.cpu, GPU = P.gpu, RAM = P.ram, DISK = P.storage, COOL = P.cooling, CASE = P['case'];
  var BOX = PRICING.appliances;

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

  // Closing question. Non-binding and it changes nothing about the build —
  // it just says where to start the conversation. `lead` is what rides along
  // to us in the quote request; `close` is what the visitor reads back.
  var EXPECT = {
    onboard: {
      label: 'Works for me',
      lead: 'Comfortable with this number — ready to talk specifics.',
      close: "Good — that's the number to work from. Bring it to the consult and we'll turn it into real parts and a firm price."
    },
    expected: {
      label: 'About what I expected',
      lead: 'Estimate landed about where they expected.',
      close: "Then we're in the right neighborhood. The consult is where this turns into real parts and a firm price."
    },
    high: {
      label: 'Higher than I hoped',
      lead: 'Estimate came in higher than hoped — wants to find savings.',
      close: "Worth talking through — there's usually room to trim without changing how the machine feels to use. Tell us your target and we'll work to it."
    },
    room: {
      label: 'I could go higher',
      lead: 'Has room above this estimate — open to a bigger build.',
      close: "Then there's headroom worth spending well. We'll show you where more money actually changes the experience, and where it quietly doesn't."
    }
  };

  // The estimate is complete by the time this asks, so it goes in the
  // question itself — on a phone the running total is a collapsed bar, and
  // signing off on a number you have to go looking for isn't signing off.
  function expectationStep() {
    return {
      question: function (b, est) {
        return est
          ? 'This build comes to ' + PRICING.range(est.total) + '. Does that land where you expected?'
          : 'Does that land where you expected?';
      },
      sub: 'Nothing is locked in either way — this just tells us where to start the conversation.',
      short: 'Expectation',
      options: [
        { label: 'Yep — that works', sub: 'Ready to talk specifics', effect: function (b) { b.expectation = EXPECT.onboard; } },
        { label: 'About what I expected', sub: 'Roughly the range I had in mind', effect: function (b) { b.expectation = EXPECT.expected; } },
        { label: 'Higher than I hoped', sub: "Let's find savings that don't hurt", effect: function (b) { b.expectation = EXPECT.high; } },
        { label: 'I could go higher', sub: 'Show me what more would buy', effect: function (b) { b.expectation = EXPECT.room; } }
      ]
    };
  }

  // ---------- The AI fork ----------
  // Picked once, up front, because it changes every question after it.
  var AI_DELIVERY_STEP = {
    question: 'How do you want it delivered?',
    sub: 'Same models either way — this is about whether you get a machine that opens up, or a sealed box that just runs.',
    short: 'Delivery',
    options: [
      { label: 'A workstation I can open up', sub: 'Standard parts — add GPUs, memory or storage later',
        effect: function (b) { b.delivery = 'workstation'; } },
      { label: 'A turnkey appliance', sub: 'One sealed box sized to the model. Nothing to assemble',
        effect: function (b) {
          b.delivery = 'appliance';
          b.trackLabel = 'Local AI appliance';
          b.notes.push('Unified memory holds much bigger models than discrete GPUs at the same price — what you trade away is speed per token, not capacity');
        } }
    ]
  };

  // Same model, different box. "Cheaper" only ever means a box that still
  // fits the model; where nothing cheaper fits, the choice is a no-op rather
  // than a quiet downgrade into something that won't load.
  function cheaperBox(a) {
    if (a === BOX.dgxSpark) return BOX.strixHalo;
    return a;
  }
  function fasterBox(a) {
    if (a === BOX.strixHalo || a === BOX.dgxSpark) return BOX.macMax128;
    if (a === BOX.macMax128 || a === BOX.sparkPair) return BOX.macUltra256;
    return a;
  }

  var AI_APPLIANCE_STEPS = [
    { question: "What's the biggest model you need to run?",
      sub: 'On an appliance this is a capacity question — the whole model has to fit in the box.',
      short: 'Model size',
      options: [
        { label: 'Efficient everyday models', sub: '7B–14B-class — fast, general-purpose',
          effect: function (b) { b.appliance = BOX.strixHalo; } },
        { label: 'Flagship open-weight 70B-class', sub: 'Llama 3.3 70B, Qwen2.5 72B-class',
          effect: function (b) { b.appliance = BOX.dgxSpark; b.notes.push('128GB of unified memory holds a 70B model comfortably — the same job needs two RTX 5090s and roughly $9,000 of GPU in a workstation'); } },
        { label: 'Frontier MoE giants', sub: 'DeepSeek-V3, 405B-class — self-hosted',
          effect: function (b) { b.appliance = BOX.sparkPair; b.notes.push('Two Sparks linked over 200GbE reach 405B-class models — a single box cannot'); } },
        { label: 'No ceiling — the biggest there is', sub: 'Trillion-parameter models, data-centre silicon on a desk',
          effect: function (b) { b.appliance = BOX.dgxStation; b.notes.push('DGX Station is data-centre hardware in a tower — we plan the power draw and the noise before it ships'); } }
      ] },

    { question: 'What matters more once it is running?',
      sub: 'Every box here fits the model you picked. Where they differ is how fast the answers come back.',
      short: 'Priority',
      options: [
        { label: 'The lowest price that still fits', sub: 'Most memory per dollar, slower replies',
          effect: function (b) { b.appliance = cheaperBox(b.appliance); b.notes.push('Sized for capacity over speed — expect a readable pace rather than instant'); } },
        { label: 'A sensible balance', sub: 'Where most offices land',
          effect: function () {} },
        { label: 'Fastest answers in the class', sub: 'Highest memory bandwidth available',
          effect: function (b) { b.appliance = fasterBox(b.appliance); b.notes.push('Apple silicon runs local models fast, but it is not CUDA — we check your tools against it before recommending it'); } }
      ] },

    { question: 'Where do the models and documents live?',
      sub: 'Flagship model weights run 40–200GB each, and a library adds up quickly.',
      short: 'Storage',
      options: [
        { label: 'The built-in drive is enough', sub: 'A couple of models and your core documents',
          effect: function (b) { b.storage = DISK.included; } },
        { label: 'Add a fast external library', sub: '4TB NVMe alongside the box',
          effect: function (b) { b.storage = DISK.nvme4tb; } },
        { label: 'Everything the business has', sub: 'Large model library plus network storage',
          effect: function (b) { b.storage = DISK.nvme8tbNet; } }
      ] },

    expectationStep()
  ];

  var TRACKS = {
    gaming: { steps: [
      { question: "What's the gaming target?", sub: 'This drives the GPU — the single biggest factor in how a game feels.', short: 'Gaming target',
        options: [
          { label: 'Competitive & high fps', sub: '1080p–1440p, maxed-out frame rate', effect: function (b) { b.gpu = GPU.fps1440; b.cpu = CPU.fast6; } },
          { label: 'Cinematic single-player', sub: '1440p, high detail', effect: function (b) { b.gpu = GPU.game1440; b.cpu = CPU.balanced8; } },
          { label: 'Go big — 4K', sub: '4K, everything maxed', effect: function (b) { b.gpu = GPU.game4k; b.cpu = CPU.keepUp; } },
          { label: 'Virtual reality', sub: 'Smooth, no-compromise VR', effect: function (b) { b.gpu = GPU.vr; b.cpu = CPU.core8; b.notes.push('VR-ready GPU + fast USB for the headset'); } }
        ] },
      { question: 'Planning to stream or record while you play?', sub: 'Encoding while gaming benefits from extra CPU headroom.', short: 'Streaming',
        options: [
          { label: 'Yes — streaming to Twitch/YouTube', sub: 'Live or recorded, on top of playing', effect: function (b) { b.notes.push('Extra CPU headroom reserved for streaming/encoding'); } },
          { label: 'No, just playing', sub: '', effect: function () {} }
        ] },
      { question: 'How many things do you usually have open at once?', sub: 'Sets how much memory (RAM) the build gets.', short: 'Multitasking',
        options: [
          { label: 'Just the game', sub: '16GB is plenty', effect: function (b) { b.ram = RAM.gb16; } },
          { label: 'Game + Discord + browser + Spotify', sub: 'The realistic default', effect: function (b) { b.ram = RAM.gb32; } },
          { label: 'I basically never close anything', sub: 'Heavy multitasker', effect: function (b) { b.ram = RAM.gb64; } }
        ] },
      { question: 'Storage — what fits your library?', sub: '', short: 'Storage',
        options: [
          { label: 'One fast drive is plenty', sub: '1TB NVMe SSD', effect: function (b) { b.storage = DISK.nvme1tb; } },
          { label: 'Give me room to grow', sub: '2TB NVMe SSD', effect: function (b) { b.storage = DISK.nvme2tb; } },
          { label: 'I hoard everything', sub: '4TB+ NVMe + bulk storage', effect: function (b) { b.storage = DISK.nvme4tbBulk; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans, on display', effect: function (b) { b['case'] = CASE.glassRgb; } },
          { label: 'Clean & quiet', sub: 'Minimal lighting, tucked under the desk', effect: function (b) { b['case'] = CASE.minimalQuiet; } },
          { label: 'Small form factor', sub: 'Compact, fits anywhere', effect: function (b) { b['case'] = CASE.sff; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = COOL.air; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = COOL.aio; } },
          { label: 'Push it — extreme cooling', sub: 'Custom loop territory', effect: function (b) { b.cooling = COOL.loop; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      expectationStep()
    ] },

    creative: { steps: [
      { question: "What's the main creative work?", sub: 'This sets the CPU/GPU balance.', short: 'Creative work',
        options: [
          { label: 'Video editing', sub: 'Premiere, DaVinci, Final Cut', effect: function (b) { b.cpu = CPU.editor; b.gpu = GPU.creatorVideo; } },
          { label: '3D & VFX', sub: 'Blender, Maya, Octane/Redshift', effect: function (b) { b.cpu = CPU.highCore; b.gpu = GPU.creator3d; } },
          { label: 'Photo & design', sub: 'Lightroom, Photoshop, Illustrator', effect: function (b) { b.cpu = CPU.fast68; b.gpu = GPU.creator16; } },
          { label: 'Music production', sub: 'Low-latency audio, big sample libraries', effect: function (b) { b.cpu = CPU.audio; b.gpu = GPU.wsEntry; } }
        ] },
      { question: 'How big are the files you work with?', sub: 'Sets how much memory (RAM) the build gets.', short: 'File sizes',
        options: [
          { label: 'Normal', sub: 'Photos, short clips', effect: function (b) { b.ram = RAM.gb32; } },
          { label: 'Big', sub: '4K/8K footage, huge scenes', effect: function (b) { b.ram = RAM.gb64; } },
          { label: 'Massive', sub: 'Multi-track 8K, dense 3D scenes', effect: function (b) { b.ram = RAM.gb128; } }
        ] },
      { question: 'Storage — active work vs. archive?', sub: '', short: 'Storage',
        options: [
          { label: 'One fast project drive', sub: '1TB NVMe', effect: function (b) { b.storage = DISK.nvme1tb; } },
          { label: 'Active + archive', sub: '2TB NVMe + bulk storage', effect: function (b) { b.storage = DISK.nvme2tbBulk; } },
          { label: 'Everything, always', sub: '4TB+ NVMe + RAID storage', effect: function (b) { b.storage = DISK.nvme4tbRaid; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: 'Clean & professional', sub: 'Looks the part in a studio', effect: function (b) { b['case'] = CASE.workstation; } },
          { label: 'RGB showpiece', sub: 'Tempered glass, RGB fans', effect: function (b) { b['case'] = CASE.glassRgb; } },
          { label: 'Small form factor', sub: 'Fits on a crowded desk', effect: function (b) { b['case'] = CASE.sff; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = COOL.air; } },
          { label: 'Liquid — quieter under load', sub: '240–360mm AIO', effect: function (b) { b.cooling = COOL.aio; } },
          { label: 'Push it — extreme cooling', sub: 'Long render sessions, max sustained clocks', effect: function (b) { b.cooling = COOL.loop; b.notes.push("Extreme cooling — we'll walk through custom-loop options on the consult"); } }
        ] },
      expectationStep()
    ] },

    // The AI track is the one that forks. Everything before the fork is
    // shared; after it, a sealed box and a workstation ask different
    // questions, so the two lists are kept separate rather than papered over
    // with questions that make no sense for one of them.
    ai: { steps: function (b) {
      return [AI_DELIVERY_STEP].concat(b.delivery === 'appliance' ? AI_APPLIANCE_STEPS : TRACKS.aiWorkstation.steps);
    } },

    aiWorkstation: { steps: [
      { question: "What's the biggest model you want to run locally?", sub: 'This is the biggest factor — how much GPU memory (VRAM) it takes to load and run the model.', short: 'Model size',
        options: [
          { label: 'Efficient everyday models', sub: '7B–14B-class — fast, general-purpose', effect: function (b) { b.gpu = GPU.aiEveryday; } },
          { label: 'Flagship open-weight 70B-class', sub: 'Llama 3.3 70B, Qwen2.5 72B-class — near-frontier quality', effect: function (b) { b.gpu = GPU.aiFlagship; b.notes.push('70B-class models need real VRAM — usually quantized or split across two GPUs'); b.notes.push('Worth asking about on the consult: a 128GB unified-memory box (DGX Spark, ~$4,700; Ryzen AI Max+ 395, ~$2,300) fits a 70B model for a fraction of this, and trades throughput for capacity'); } },
          { label: 'Frontier MoE giants', sub: 'DeepSeek-V3, Llama 3.1 405B-class — the actual frontier, self-hosted', effect: function (b) { b.gpu = GPU.aiFrontier; b.notes.push("This is a serious multi-GPU build — we'll scope exact GPU count, power, and cooling on your consult"); } },
          { label: 'Not sure yet', sub: "We'll size it to whatever you end up running", effect: function (b) { b.gpu = GPU.aiFlexible; } }
        ] },
      { question: 'How will you actually use it day to day?', sub: 'Agents and long-context work lean harder on CPU and memory than simple chat does.', short: 'Daily use',
        options: [
          { label: 'Chat & document Q&A', sub: 'Ask questions, search internal docs', effect: function (b) { b.cpu = CPU.core8; b.ram = RAM.gb32; } },
          { label: 'Coding assistant', sub: 'Large context, big codebases', effect: function (b) { b.cpu = CPU.core12; b.ram = RAM.gb64; b.notes.push('Long-context coding wants RAM headroom and fast storage for repo indexing'); } },
          { label: 'Agents that use tools & chain tasks', sub: 'Browses, calls APIs, runs multi-step jobs', effect: function (b) { b.cpu = CPU.core12; b.ram = RAM.gb64; b.notes.push('Agent orchestration runs several processes at once — extra CPU cores keep it responsive'); } },
          { label: 'Multiple people or agents at once', sub: 'Concurrent users, or several agents in parallel', effect: function (b) { b.cpu = CPU.server; b.ram = RAM.gb128; b.notes.push('Concurrency needs CPU, RAM, and VRAM headroom on top of the base model'); } }
        ] },
      { question: 'How much local model & data storage do you need?', sub: 'Flagship model weights alone can run 40–200GB+ each.', short: 'Storage',
        options: [
          { label: 'A focused library', sub: 'One or two models, core documents', effect: function (b) { b.storage = DISK.nvme2tb; } },
          { label: 'Growing steadily', sub: 'Several models plus a document library', effect: function (b) { b.storage = DISK.nvme4tb; } },
          { label: 'Everything the business has', sub: 'Large model library + network storage', effect: function (b) { b.storage = DISK.nvme8tbNet; } }
        ] },
      { question: 'Where does it live?', sub: '', short: 'Location',
        options: [
          { label: 'Tucked away & quiet', sub: 'A closet or back office', effect: function (b) { b['case'] = CASE.serverQuiet; } },
          { label: 'On display in the office', sub: '', effect: function (b) { b['case'] = CASE.office; } },
          { label: 'Rack-mountable', sub: 'Goes in a server rack', effect: function (b) { b['case'] = CASE.rack; } }
        ] },
      { question: 'Cooling?', sub: 'Multi-GPU AI workloads run hot for long, sustained stretches.', short: 'Cooling',
        options: [
          { label: 'Air cooling is fine', sub: 'Quiet, reliable, low-maintenance', effect: function (b) { b.cooling = COOL.airAi; } },
          { label: 'Liquid — quieter under sustained load', sub: '240–360mm AIO', effect: function (b) { b.cooling = COOL.aio; } },
          { label: 'Push it — extreme cooling', sub: 'Maximum sustained multi-GPU performance', effect: function (b) { b.cooling = COOL.loop; b.notes.push("Extreme cooling — we'll walk through custom-loop and rack cooling options on the consult"); } }
        ] },
      expectationStep()
    ] },

    everyday: { steps: [
      { question: "What's it mainly for?", sub: '', short: 'Main use',
        options: [
          { label: 'Browsing, email, streaming video', sub: '', effect: function (b) { b.cpu = CPU.eff6; b.gpu = GPU.igpu; } },
          { label: 'Office work & video calls', sub: '', effect: function (b) { b.cpu = CPU.office68; b.gpu = GPU.igpu; } },
          { label: 'Light photo editing & light gaming', sub: '', effect: function (b) { b.cpu = CPU.core8; b.gpu = GPU.entry8; } }
        ] },
      { question: 'How many things do you usually have open at once?', sub: '', short: 'Multitasking',
        options: [
          { label: "A few tabs, that's it", sub: '', effect: function (b) { b.ram = RAM.gb8; } },
          { label: 'The usual mix', sub: 'Browser, email, a couple apps', effect: function (b) { b.ram = RAM.gb16; } },
          { label: 'I never close anything', sub: '', effect: function (b) { b.ram = RAM.gb32; } }
        ] },
      { question: 'Storage?', sub: '', short: 'Storage',
        options: [
          { label: 'Just the basics', sub: '512GB SSD', effect: function (b) { b.storage = DISK.ssd512; } },
          { label: 'A bit of room', sub: '1TB SSD', effect: function (b) { b.storage = DISK.ssd1tb; } },
          { label: 'Plenty of space', sub: '2TB SSD', effect: function (b) { b.storage = DISK.ssd2tb; } }
        ] },
      { question: 'Look & feel?', sub: '', short: 'Look & feel',
        options: [
          { label: "Doesn't matter, just works", sub: '', effect: function (b) { b['case'] = CASE.minimal; } },
          { label: 'Clean & quiet', sub: '', effect: function (b) { b['case'] = CASE.dampened; } },
          { label: 'Small footprint', sub: 'Fits on the desk', effect: function (b) { b['case'] = CASE.sff; } }
        ] },
      { question: 'Cooling?', sub: '', short: 'Cooling',
        options: [
          { label: 'Standard is fine', sub: '', effect: function (b) { b.cooling = COOL.stock; } },
          { label: 'Whisper-quiet, please', sub: '', effect: function (b) { b.cooling = COOL.quiet; } }
        ] },
      expectationStep()
    ] }
  };

  var SLOTS = [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'Memory'], ['storage', 'Storage'], ['cooling', 'Cooling'], ['case', 'Case']];
  // An appliance is one sealed box — it has no CPU/GPU/memory to choose, so
  // the spec panel shows the box and whatever storage got bolted onto it.
  var APPLIANCE_SLOTS = [['appliance', 'System'], ['storage', 'Storage']];
  function slotsFor(b) { return b && b.delivery === 'appliance' ? APPLIANCE_SLOTS : SLOTS; }

  // A track's steps are usually a fixed list, but the AI track forks: once
  // you pick 'appliance' the remaining questions are different ones, because
  // a sealed box has no cooling or case to choose. Resolving the list from
  // the build-so-far is what lets that work while keeping every answer a
  // plain index in the URL hash.
  function stepsFor(build) {
    if (!build || !build.track) return null;
    var defn = TRACKS[build.track].steps;
    return typeof defn === 'function' ? defn(build) : defn;
  }
  var PURPOSE_SHORT = 'Build type';

  // ---------- State ----------
  // `answers` is where the visitor is now; `recalled` remembers the deepest
  // path they've taken, so stepping back can show what they picked before.
  var state = { answers: [], build: null, estimate: null, trackSteps: null, finished: false };
  var recalled = [];
  var prevBuild = null;
  var prevTotal = null;
  var pushDepth = 0;   // how many of our own history entries sit behind us
  var rigOpen = false; // mobile: is the build panel expanded

  function defaultBuild() {
    return { track: null, trackLabel: null, interest: null, delivery: null, appliance: null, cpu: null, gpu: null, ram: null, storage: null, cooling: null, "case": null, expectation: null, notes: [] };
  }

  function stepAt(i) {
    return i === 0 ? PURPOSE_STEP : state.trackSteps[i - 1];
  }

  // A step's question may be a function of the build so far — the closing
  // expectation check reads the current estimate back to the visitor.
  function stepQuestion(step) {
    return typeof step.question === 'function' ? step.question(state.build, state.estimate) : step.question;
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
    var trackSteps = stepsFor(build);
    for (var i = 1; i < state.answers.length; i++) {
      // Re-resolve every iteration: an earlier answer may have swapped the
      // remaining questions out from under us.
      trackSteps = stepsFor(build);
      var step = trackSteps && trackSteps[i - 1];
      var opt = step && step.options[state.answers[i]];
      if (!opt) break;
      opt.effect(build);
    }
    trackSteps = stepsFor(build);
    state.build = build;
    state.estimate = PRICING.estimate(build);
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
    // Replay as we go — with a forking track the valid options at position i
    // depend on the answers before it.
    var probe = defaultBuild();
    PURPOSE_STEP.options[first].effect(probe);
    for (var i = 1; i < parts.length; i++) {
      var steps = stepsFor(probe);
      if (!steps || i - 1 >= steps.length) break;
      var n = parseInt(parts[i], 10);
      var opt = n >= 0 ? steps[i - 1].options[n] : null;
      if (!opt) break;
      answers.push(n);
      opt.effect(probe);
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
    var beforeEstimate = state.estimate;
    // On mobile the build panel overlays the questions, so answering closes
    // it again; the estimate in the collapsed bar still updates live.
    rigOpen = false;
    applyAnswers(state.answers.concat([index]), 'push', true);
    announceChange(before, state.build, beforeEstimate, state.estimate);
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
    prevTotal = null;
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
  function announceChange(before, after, beforeEst, afterEst) {
    if (!liveEl) return;
    var changes = [];
    slotsFor(after).forEach(function (pair) {
      var key = pair[0];
      if (after[key] && (!before || before[key] !== after[key])) changes.push(pair[1] + ': ' + after[key].label);
    });
    if (!changes.length) { liveEl.textContent = ''; return; }
    var msg = 'Build updated. ' + changes.join('. ') + '.';
    if (afterEst && (!beforeEst || String(beforeEst.total) !== String(afterEst.total))) {
      msg += ' Estimate now ' + PRICING.range(afterEst.total) + '.';
    }
    liveEl.textContent = msg;
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
        'aria-label="' + escapeHtml('Change your answer to: ' + stepQuestion(step) + ' — currently ' + label) + '">' +
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
      '<h2 class="builder-question" id="builder-question" tabindex="-1">' + escapeHtml(stepQuestion(step)) + '</h2>' +
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
    return slotsFor(b).filter(function (pair) { return b[pair[0]]; }).map(function (pair) {
      var part = b[pair[0]];
      return '<div class="spec-row">' +
        '<dt>' + escapeHtml(pair[1]) + '</dt>' +
        '<dd>' + escapeHtml(part.label) + '<span class="spec-price">' + escapeHtml(PRICING.range(part.price)) + '</span></dd>' +
      '</div>';
    }).join('');
  }

  function totalsHtml(est) {
    if (!est) return '';
    // Handling is broken out as its own line rather than folded into the
    // components figure. A disclosed percentage is defensible; the same money
    // hidden inside a parts total is the thing people feel cheated by later.
    var rows = [
      [(est.appliance ? 'Hardware' : 'Components (' + est.known + ')'), PRICING.range(est.components)]
    ];
    // An appliance has no separate platform to buy — it is the platform.
    //
    // The platform goes ABOVE the handling line, because handling is charged
    // on it too. Someone checking the percentage against the line above it has
    // to arrive at the number we printed — a disclosed fee that doesn't
    // reconcile reads worse than one that was never broken out at all.
    if (est.platform) rows.push([est.platform.label, PRICING.range(est.platform.price)]);
    rows.push([(est.appliance ? 'Hardware' : 'Parts') + ' handling (' + PRICING.pct(est.handlingPct) + ')', PRICING.range(est.handling)]);
    if (est.labor) rows.push([est.labor.label, PRICING.money(est.labor.fee)]);
    est.laborModifiers.forEach(function (m) { rows.push([m.label, PRICING.money(m.fee)]); });

    return '<div class="spec-totals">' +
      rows.map(function (r) {
        return '<div class="spec-total-row"><span>' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></div>';
      }).join('') +
      '<div class="spec-total-row is-grand"><span>Estimated total</span><span>' + escapeHtml(PRICING.range(est.total)) + '</span></div>' +
    '</div>' +
    '<p class="spec-fine">' + (est.appliance ? 'Hardware is' : 'Components and platform are') + ' quoted at our cost plus ' + PRICING.pct(est.handlingPct) +
      ' handling, priced as of ' + escapeHtml(est.asOf) + '. <strong>Good for ' + est.validDays +
      ' days</strong> — memory, storage and GPUs are currently moving 10–15% a quarter. Excludes shipping, tax, and peripherals. Final numbers are confirmed on your free consultation.</p>';
  }

  function renderSummaryPanel() {
    var b = state.build;
    var est = state.estimate;
    panelEl.innerHTML =
      progressHtml(100, 'Build complete') +
      trailHtml() +
      '<h2 class="builder-question" id="builder-question" tabindex="-1">Your ' + escapeHtml(b.trackLabel) + ', on paper.</h2>' +
      '<p class="builder-sub">An estimate, not a quote. Change any answer above to see the number move — exact parts and current pricing get locked in on your free consultation.</p>' +
      '<div class="spec-sheet">' +
        '<dl class="spec-list">' + specRowsHtml(b) + '</dl>' +
        (b.notes.length
          ? '<div class="spec-notes"><p class="spec-notes-title">Worth knowing</p><ul>' +
              b.notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') +
            '</ul></div>'
          : '') +
      '</div>' +
      totalsHtml(est) +
      (b.expectation ? '<p class="builder-close">' + escapeHtml(b.expectation.close) + '</p>' : '') +
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
    while (s.length < 12) s += ' ';
    // Modifier labels run past the column; they still need a gap after the colon.
    return s.length > 12 ? s + ' ' : s;
  }

  function specText(b) {
    var est = state.estimate;
    var lines = ['Ahern AI — PC build sandbox', b.trackLabel, ''];
    slotsFor(b).forEach(function (pair) {
      if (b[pair[0]]) lines.push(pad(pair[1]) + b[pair[0]].label + '  ' + PRICING.range(b[pair[0]].price));
    });
    if (est) {
      lines.push('', pad(est.appliance ? 'Hardware' : 'Components') + PRICING.range(est.components));
      if (est.platform) lines.push(pad('Platform') + PRICING.range(est.platform.price) + '  (' + est.platform.label + ')');
      lines.push(pad('Handling ' + PRICING.pct(est.handlingPct)) + PRICING.range(est.handling));
      if (est.labor) lines.push(pad('Build fee') + PRICING.money(est.labor.fee));
      est.laborModifiers.forEach(function (m) { lines.push(pad(m.label) + PRICING.money(m.fee)); });
      lines.push(pad('ESTIMATE') + PRICING.range(est.total));
    }
    if (b.expectation) lines.push('', 'On the estimate: ' + b.expectation.label);
    if (b.notes.length) {
      lines.push('', 'Worth knowing');
      b.notes.forEach(function (n) { lines.push('  - ' + n); });
    }
    lines.push('',
      'Components and platform at our cost plus ' + PRICING.pct(PRICING.handlingPct) + ' handling, priced as of ' + (est ? est.asOf : PRICING.asOf) + '.',
      'Good for ' + PRICING.validDays + ' days — parts are moving 10-15% a quarter. Excludes shipping, tax,',
      'and peripherals. Final numbers are confirmed on a free consultation.',
      shareUrl());
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
    var est = state.estimate;
    var parts = slotsFor(b).map(function (pair) {
      return b[pair[0]] ? b[pair[0]].label : null;
    }).filter(Boolean);
    var summary = 'Sandbox build (' + b.trackLabel + '): ' + parts.join(' · ') + '.' +
      (est ? ' Sandbox estimate: ' + PRICING.range(est.total) + ' (parts + ' + PRICING.pct(PRICING.handlingPct) + ' handling, as of ' + est.asOf + ', + build fee; good ' + PRICING.validDays + ' days).' : '') +
      (b.expectation ? ' ' + b.expectation.lead : '') +
      ' Full config: ' + shareUrl();
    var params = new URLSearchParams();
    if (b.interest) params.set('interest', b.interest);
    params.set('build', summary);
    return '/?' + params.toString() + '#audit';
  }

  // ---------- Build panel ("the rig") ----------
  function renderRig() {
    var b = state.build;
    var est = state.estimate;
    var filled = 0;
    var slots = slotsFor(b);
    var lines = slots.map(function (pair) {
      var key = pair[0], label = pair[1];
      var part = b[key];
      if (part) filled++;
      var changed = prevBuild && prevBuild[key] !== part && part;
      var cls = 'rig-line' + (part ? ' is-set' : '') + (changed ? ' just-set' : '');
      return '<p class="t-line ' + cls + '"><span class="t-prompt">' + label + '</span><span class="rig-value">' + (part ? escapeHtml(part.label) : 'pending') + '</span></p>';
    }).join('');

    var totalText = est ? PRICING.range(est.total) : null;
    var estChanged = totalText && prevTotal && prevTotal !== totalText;
    var estimateLine = est
      ? '<p class="t-line t-estimate' + (estChanged ? ' just-set' : '') + '">' +
          '<span class="t-prompt">Estimate</span><span class="rig-value">' + escapeHtml(totalText) + '</span>' +
        '</p>' +
        '<p class="rig-estimate-note">' + (est.complete ? (est.appliance ? 'system + handling + setup fee' : 'parts + handling + build fee') : 'so far — ' + filled + ' of ' + slots.length + ' parts') + '</p>'
      : '';

    var notes = b.notes.length ? '<div class="rig-notes">' + b.notes.map(function (n) { return '<p>&middot; ' + escapeHtml(n) + '</p>'; }).join('') + '</div>' : '';
    var label = (b.trackLabel || 'new-build').toLowerCase().replace(/\s+/g, '-');
    var barText = totalText ? filled + '/' + slots.length + ' · ' + totalText : filled + ' of ' + slots.length + ' parts';

    rigEl.className = 'builder-rig' + (rigOpen ? ' is-open' : '');
    rigEl.innerHTML =
      '<button type="button" class="rig-toggle" id="rig-toggle" aria-expanded="' + (rigOpen ? 'true' : 'false') + '" aria-controls="rig-terminal">' +
        '<span class="rig-toggle-label">Your build</span>' +
        '<span class="rig-toggle-count">' + escapeHtml(barText) + '</span>' +
        '<span class="rig-toggle-chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="terminal" id="rig-terminal">' +
        '<div class="terminal-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="terminal-label">' + escapeHtml(label) + '.cfg &middot; ' + filled + ' of ' + slots.length + ' parts</span></div>' +
        '<div class="terminal-body">' + lines + estimateLine + '</div>' +
        notes +
      '</div>';

    var toggle = document.getElementById('rig-toggle');
    toggle.addEventListener('click', function () {
      rigOpen = !rigOpen;
      rigEl.classList.toggle('is-open', rigOpen);
      toggle.setAttribute('aria-expanded', rigOpen ? 'true' : 'false');
    });
    // Collapsed on mobile, the bar is the only signal that the estimate moved.
    if (estChanged) {
      toggle.classList.add('is-updated');
      setTimeout(function () { toggle.classList.remove('is-updated'); }, 1000);
    }

    prevTotal = totalText;
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
