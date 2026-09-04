// Ahern AI — PC Builder pricing model.
//
// Prices verified September 2026 against US street pricing (Amazon / Newegg
// lowest current listings), not MSRP. MSRP is fiction in this market — the
// RTX 5090 carries a $1,999 sticker and sells around $4,500.
//
// !! THIS FILE GOES STALE FAST. Right now components are moving 10–15% a
// !! quarter. Re-check it quarterly at minimum, and update AS_OF when you do.
//
// Structure:
//   parts    — the catalog. Each entry carries the label the site shows, a
//              [low, high] price band, a `tier` used to size the platform
//              around it, and any labor modifiers it triggers.
//   platform — motherboard, PSU, fans, OS, cabling. Nobody picks these in the
//              quiz but they cost real money, and a 4-GPU server needs a very
//              different platform than an office box.
//   labor    — flat build fee, plus a handling percentage on the hardware.
//
// Part keys are named for the *job* the part does (game4k, aiFlagship,
// creatorVideo), never for the silicon in it. Model names in keys mean the
// whole catalog has to be re-keyed every generation and every reference in
// pc-builder.js chased down with it — which is exactly what happened when the
// RTX 40-series names in here aged out. Labels carry the model; keys don't.
//
// Prices are bands, not points, on purpose — a range reads as an estimate,
// a single number reads as a quote.
(function () {
  // Shown on the site so a stale estimate is visibly stale.
  var AS_OF = 'September 2026';

  // How long an estimate is good for. Components are moving fast enough that
  // an open-ended number is a promise we can't keep — this caps the exposure
  // and, said out loud, reads as competence rather than hedging.
  var VALID_DAYS = 7;

  // Handling on every line bought at cost — components and platform alike —
  // disclosed on the summary. This is NOT margin for its own sake: between
  // quoting and buying, prices move, and without it every move comes out of
  // the build fee. Quoting at bare cost in a market like this one isn't
  // generous, it's uninsured.
  //
  // Whenever this changes, the disclosure copy in pc-builder.js reads it from
  // here — but the two prose mentions in pc-builder.html are hand-written.
  // Check those too.
  var PARTS_HANDLING = 0.10;

  var parts = {
    // CPUs held up better than memory or storage through the shortage —
    // logic fabs, not DRAM/NAND — so these moved single digits, not multiples.
    cpu: {
      eff6:      { label: 'Efficient 6-core CPU',                                   price: [150, 220],   tier: 1 },
      office68:  { label: '6–8 core CPU',                                           price: [200, 300],   tier: 1 },
      fast6:     { label: 'High-frequency 6-core CPU (fast per-core speed for fps)', price: [230, 320],   tier: 2 },
      fast68:    { label: 'Fast 6–8 core CPU',                                      price: [300, 400],   tier: 2 },
      core8:     { label: '8-core CPU',                                             price: [330, 450],   tier: 2 },
      balanced8: { label: '8-core CPU, balanced',                                   price: [330, 450],   tier: 2 },
      audio:     { label: 'High-frequency CPU (low audio latency)',                 price: [330, 460],   tier: 2 },
      core12:    { label: '12-core CPU',                                            price: [480, 650],   tier: 3 },
      highCore:  { label: 'High-core-count CPU',                                    price: [500, 700],   tier: 3 },
      keepUp:    { label: 'Gaming-class CPU with 3D cache (9800X3D-class)',         price: [470, 680],   tier: 3 },
      editor:    { label: 'High-core-count CPU (fast timeline scrubbing & export)', price: [500, 700],   tier: 3 },
      server:    { label: 'High-core-count server-class CPU',                       price: [1400, 2800], tier: 5 }
    },

    // RTX 50-series (Blackwell) and RX 9000, at street prices as of 3 Sep 2026.
    // The 5090 in particular sells at well over double its MSRP; quoting the
    // sticker price on one of these is how you lose money on a build.
    gpu: {
      igpu:          { label: 'Integrated graphics',                                     price: [0, 0],         tier: 1 },
      entry8:        { label: 'Entry GPU, 8GB (RTX 5050-class)',                         price: [270, 340],     tier: 1 },
      wsEntry:       { label: 'Entry workstation GPU',                                   price: [330, 520],     tier: 2 },
      fps1440:       { label: 'RTX 5060 Ti / RX 9060 XT-class, 16GB',                    price: [440, 560],     tier: 2 },
      creator16:     { label: 'RTX 5060 Ti-class GPU, 16GB',                             price: [440, 560],     tier: 2 },
      creatorVideo:  { label: 'RTX 5070-class GPU, 12GB (GPU-accelerated export)',       price: [650, 820],     tier: 2 },
      game1440:      { label: 'RTX 5070 Ti-class, 16GB',                                 price: [850, 1050],    tier: 3 },
      aiEveryday:    { label: 'RTX 5070 Ti-class GPU, 16GB VRAM',                        price: [850, 1050],    tier: 3 },
      vr:            { label: 'RTX 5070 Ti / 5080-class, 16GB+ (VR-ready)',              price: [850, 1600],    tier: 3 },
      creator3d:     { label: 'RTX 5080-class GPU, 16GB (fast GPU rendering)',           price: [1300, 1600],   tier: 3 },
      game4k:        { label: 'RTX 5080-class, 16GB',                                    price: [1300, 1600],   tier: 3 },
      aiFlexible:    { label: 'RTX 5090-class GPU, 32GB VRAM (flexible headroom)',       price: [4200, 5000],   tier: 3 },
      aiFlagship:    { label: 'Dual RTX 5090-class GPUs, 64GB combined VRAM',            price: [8400, 10500],  tier: 4 },
      aiFrontier:    { label: 'Multi-GPU server build, 128GB+ VRAM',                     price: [17000, 32000], tier: 5 }
    },

    // Memory is the single worst-hit line in the build. Hyperscalers buying
    // HBM and DRAM at any price pulled Samsung and SK Hynix off consumer
    // DDR5; a 64GB kit that was ~$190 in mid-2025 is ~$900 now. Analysts
    // don't expect relief before late 2027, so don't "correct" these down.
    ram: {
      gb8:   { label: '8GB',   price: [95, 150] },
      gb16:  { label: '16GB',  price: [190, 300] },
      gb32:  { label: '32GB',  price: [390, 610] },
      gb64:  { label: '64GB',  price: [850, 1120] },
      gb128: { label: '128GB', price: [2000, 3000] }
    },

    // NAND is in the same squeeze as DRAM. Contract prices more than doubled
    // across the first half of 2026, and the 4TB+ tiers took it worst.
    storage: {
      included:    { label: 'Built-in storage (included with the box)', price: [0, 0] },
      ssd512:      { label: '512GB SSD',                        price: [80, 130] },
      ssd1tb:      { label: '1TB SSD',                          price: [150, 240] },
      ssd2tb:      { label: '2TB SSD',                          price: [300, 480] },
      nvme1tb:     { label: '1TB NVMe SSD',                     price: [160, 260] },
      nvme2tb:     { label: '2TB NVMe SSD',                     price: [310, 490] },
      nvme4tb:     { label: '4TB NVMe SSD',                     price: [680, 950] },
      nvme2tbBulk: { label: '2TB NVMe SSD + bulk storage',      price: [420, 650] },
      nvme4tbBulk: { label: '4TB+ NVMe SSD + bulk HDD',         price: [820, 1200] },
      nvme4tbRaid: { label: '4TB+ NVMe SSD + RAID storage',     price: [1500, 2400] },
      nvme8tbNet:  { label: '8TB+ NVMe SSD + network storage',  price: [2200, 3800] }
    },

    cooling: {
      stock: { label: 'Standard air cooling',                 price: [30, 55] },
      air:   { label: 'High-performance air cooler',          price: [55, 105] },
      quiet: { label: 'Whisper-quiet air cooling',            price: [70, 130] },
      airAi: { label: 'High-performance air cooling',         price: [85, 165] },
      aio:   { label: '240–360mm AIO liquid cooler',          price: [130, 240] },
      loop:  { label: 'Custom liquid loop (extreme cooling)', price: [520, 1050], mods: ['customLoop'] }
    },

    "case": {
      minimal:     { label: 'Minimal case',                      price: [65, 115] },
      office:      { label: 'Clean case, visible on-site',       price: [100, 180] },
      dampened:    { label: 'Sound-dampened case',               price: [100, 180] },
      minimalQuiet:{ label: 'Minimal case, sound-dampened',      price: [100, 180] },
      workstation: { label: 'Minimal workstation case',          price: [125, 215] },
      sff:         { label: 'Compact SFF case',                  price: [125, 225] },
      glassRgb:    { label: 'Tempered-glass case, RGB fans',     price: [125, 250], mods: ['showpiece'] },
      serverQuiet: { label: 'Quiet, minimal server-style case',  price: [150, 270] },
      rack:        { label: 'Rack-mountable chassis',            price: [280, 680] }
    }
  };

  // Turnkey AI appliances — sealed boxes that replace the CPU, GPU, memory
  // AND platform in one SKU, so they are priced as a single line and skip the
  // platform table entirely. Folding one into the GPU slot would double-count
  // the rest of the machine.
  //
  // These exist because unified memory changed the maths for local inference.
  // A 70B model needs ~40–70GB to load; getting that from discrete GPUs means
  // two RTX 5090s and roughly $9,000 of silicon, while a $2,300 Strix Halo box
  // holds it in 128GB of shared memory. The appliance is far slower per token
  // — bandwidth, not capacity, is what it trades away — but for a small office
  // running one model, slower and affordable beats faster and unbought.
  var appliances = {
    strixHalo:    { label: 'Ryzen AI Max+ 395 mini workstation, 128GB unified', price: [2200, 2500] },
    dgxSpark:     { label: 'NVIDIA DGX Spark, 128GB unified',                   price: [3200, 4900] },
    macMax128:    { label: 'Mac Studio M5 Max, 128GB unified',                  price: [4300, 5200] },
    sparkPair:    { label: 'Two NVIDIA DGX Sparks clustered, 256GB combined',   price: [7000, 9800], mods: ['clustered'] },
    macUltra256:  { label: 'Mac Studio M5 Ultra, 256GB unified',                price: [9000, 10500] },
    macUltra512:  { label: 'Mac Studio M5 Ultra, 512GB unified',                price: [16500, 18500] },
    dgxStation:   { label: 'NVIDIA DGX Station (GB300), 748GB coherent',        price: [92000, 125000] }
  };

  // Motherboard, PSU, fans, OS, cabling — sized to the highest-tier part in
  // the build. First entry whose maxTier covers the build tier wins.
  //
  // Boards moved with everything else: ASUS, Gigabyte and MSI all raised
  // prices from Q3 2026 on PCB costs that are up ~50%, and PSUs followed
  // copper.
  var platform = [
    { maxTier: 1, label: 'Office platform (board, 550W PSU, OS, cabling)',          price: [330, 480] },
    { maxTier: 2, label: 'Mainstream platform (board, 750W PSU, OS, cabling)',      price: [480, 700] },
    { maxTier: 3, label: 'High-end platform (board, 1000W PSU, OS, cabling)',       price: [660, 950] },
    { maxTier: 4, label: 'Dual-GPU platform (HEDT board, 1600W PSU, OS)',           price: [1150, 1800] },
    { maxTier: 5, label: 'Multi-GPU server platform (server board, redundant PSU)', price: [2300, 4000] }
  ];

  // Flat build fee. Local AI scales with GPU tier because that work is
  // systems integration — power planning, sustained-load thermal validation,
  // driver stack, inference server, quantization — not just assembly.
  var labor = {
    everyday: { fee: 175, label: 'Build fee — everyday PC' },
    gaming:   { fee: 250, label: 'Build fee — gaming PC' },
    creative: { fee: 325, label: 'Build fee — creator workstation' },
    ai: {
      byTier: {
        3: { fee: 850,  label: 'Build fee — local AI (single GPU)' },
        4: { fee: 1600, label: 'Build fee — local AI (dual GPU)' },
        5: { fee: 2800, label: 'Build fee — local AI (multi-GPU / rack)' }
      },
      fallback: { fee: 850, label: 'Build fee — local AI' }
    },
    // No assembly on an appliance, but the work that actually matters on a
    // local AI system is unchanged: model selection and quantization, the
    // inference server, integrating it with what the business already runs,
    // and proving it holds up under sustained load.
    appliance: { fee: 650, label: 'Setup fee — AI appliance' }
  };

  var laborModifiers = {
    customLoop: { fee: 450, label: 'Custom liquid loop' },
    showpiece:  { fee: 100, label: 'Showpiece build (custom cables, cable management)' },
    rackMount:  { fee: 200, label: 'Rack mounting' },
    clustered:  { fee: 400, label: 'Two-node cluster setup (fabric, model sharding)' }
  };

  var SLOTS = ['cpu', 'gpu', 'ram', 'storage', 'cooling', 'case'];

  // An appliance build fills two slots at most: the box, and any storage
  // bolted onto it.
  var APPLIANCE_SLOTS = ['appliance', 'storage'];

  function roundTo(n, step) {
    return Math.round(n / step) * step;
  }

  function laborFor(track, tier) {
    if (track === 'ai') {
      return labor.ai.byTier[tier] || labor.ai.fallback;
    }
    return labor[track] || null;
  }

  // Shared tail for both estimate paths: handling, labor, modifiers, total.
  // `plat` is null on an appliance — it has no separate platform to buy — and
  // every consumer of `platform` has to tolerate that.
  function finish(opts) {
    var componentsLo = opts.componentsLo, componentsHi = opts.componentsHi;
    var platLo = opts.platform ? opts.platform.price[0] : 0;
    var platHi = opts.platform ? opts.platform.price[1] : 0;

    // Handling is charged on everything bought at cost — the parts picked in
    // the quiz AND the platform. The platform is board, PSU, OS and cabling
    // bought in the same market on the same curve; exempting it meant the
    // build fee silently absorbed every price move on that share of the
    // hardware, which on a high-end box is several hundred dollars.
    var hardwareLo = componentsLo + platLo;
    var hardwareHi = componentsHi + platHi;
    var handlingLo = hardwareLo * PARTS_HANDLING;
    var handlingHi = hardwareHi * PARTS_HANDLING;

    var laborTotal = opts.labor ? opts.labor.fee : 0;
    var modLines = opts.mods.map(function (m) {
      var mod = laborModifiers[m];
      if (mod) laborTotal += mod.fee;
      return mod;
    }).filter(Boolean);

    var lo = hardwareLo + handlingLo + laborTotal;
    var hi = hardwareHi + handlingHi + laborTotal;

    return {
      asOf: AS_OF,
      validDays: VALID_DAYS,
      appliance: !!opts.isAppliance,
      known: opts.known,
      slotCount: opts.slotCount,
      complete: opts.known === opts.slotCount,
      tier: opts.tier,
      components: [Math.round(componentsLo), Math.round(componentsHi)],
      handlingPct: PARTS_HANDLING,
      handling: [Math.round(handlingLo), Math.round(handlingHi)],
      // Everything bought at cost, handling included: components + platform.
      parts: [Math.round(hardwareLo + handlingLo), Math.round(hardwareHi + handlingHi)],
      platform: opts.platform,
      labor: opts.labor,
      laborModifiers: modLines,
      laborTotal: laborTotal,
      // Rounded to the nearest $25 — the inputs aren't precise enough to
      // justify a figure that looks like it is.
      total: [roundTo(lo, 25), roundTo(hi, 25)]
    };
  }

  function estimateAppliance(build) {
    var lo = 0, hi = 0, known = 0, mods = [];

    APPLIANCE_SLOTS.forEach(function (key) {
      var p = build[key];
      if (!p) return;
      known++;
      lo += p.price[0];
      hi += p.price[1];
      (p.mods || []).forEach(function (m) { if (mods.indexOf(m) < 0) mods.push(m); });
    });

    if (!known) return null;

    return finish({
      isAppliance: true,
      componentsLo: lo, componentsHi: hi,
      known: known, slotCount: APPLIANCE_SLOTS.length,
      tier: 3,
      platform: null,
      labor: labor.appliance,
      mods: mods
    });
  }

  // Returns null until at least one part is known, so the UI can stay quiet
  // rather than showing a confident $0.
  function estimate(build) {
    if (build.appliance) return estimateAppliance(build);

    var partsLo = 0, partsHi = 0, known = 0, tier = 1, mods = [], seen = {};

    SLOTS.forEach(function (key) {
      var p = build[key];
      if (!p) return;
      known++;
      partsLo += p.price[0];
      partsHi += p.price[1];
      if (p.tier) tier = Math.max(tier, p.tier);
      (p.mods || []).forEach(function (m) {
        if (!seen[m]) { seen[m] = true; mods.push(m); }
      });
    });

    if (!known) return null;

    var plat = null;
    for (var i = 0; i < platform.length; i++) {
      if (tier <= platform[i].maxTier) { plat = platform[i]; break; }
    }
    if (!plat) plat = platform[platform.length - 1];

    return finish({
      isAppliance: false,
      componentsLo: partsLo, componentsHi: partsHi,
      known: known, slotCount: SLOTS.length,
      tier: tier,
      platform: plat,
      labor: laborFor(build.track, tier),
      mods: mods
    });
  }

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  // Both ends carry the dollar sign: "$2,325–$3,550". Editorial style drops
  // the repeat ("$50–75"), but that's a rule for prose — on a price a bare
  // second number reads as a typo, and a price people are deciding to trust
  // can't afford the double-take.
  function range(pair) {
    if (!pair[0] && !pair[1]) return 'included';
    if (pair[0] === pair[1]) return money(pair[0]);
    return money(pair[0]) + '–' + money(pair[1]);
  }

  function pct(n) {
    return Math.round(n * 100) + '%';
  }

  window.AHERN_PRICING = {
    asOf: AS_OF,
    validDays: VALID_DAYS,
    handlingPct: PARTS_HANDLING,
    parts: parts,
    appliances: appliances,
    platform: platform,
    labor: labor,
    laborModifiers: laborModifiers,
    estimate: estimate,
    money: money,
    range: range,
    pct: pct
  };
})();
