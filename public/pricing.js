// Ahern AI Solutions — PC Builder pricing model.
//
// !! EVERY NUMBER IN THIS FILE IS A PLACEHOLDER. Check component prices and
// !! confirm the build fees before this goes live.
//
// Structure:
//   parts    — the catalog. Each entry carries the label the site shows, a
//              [low, high] price band, a `tier` used to size the platform
//              around it, and any labor modifiers it triggers.
//   platform — motherboard, PSU, fans, OS, cabling. Nobody picks these in the
//              quiz but they cost real money, and a 4-GPU server needs a very
//              different platform than an office box.
//   labor    — flat build fee. Parts are quoted at cost, so this fee carries
//              the whole business: the free consult, testing time, warranty
//              and RMA handling, and the occasional DOA rebuild.
//
// Prices are bands, not points, on purpose — a range reads as an estimate,
// a single number reads as a quote.
//
// When this moves to live vendor pricing, `parts` is the seam: each entry
// grows a product id, and `price` gets refreshed on a schedule. Nothing
// outside this file needs to change.
(function () {
  // Shown on the site so a stale estimate is visibly stale.
  var AS_OF = 'March 2026';

  // Parts are quoted at cost. If you ever want a handling percentage on
  // components, set this to e.g. 0.06 and disclose it — the estimate math
  // already routes through it.
  var PARTS_HANDLING = 0;

  var parts = {
    cpu: {
      eff6:      { label: 'Efficient 6-core CPU',                                  price: [130, 190],   tier: 1 },
      office68:  { label: '6–8 core CPU',                                          price: [180, 260],   tier: 1 },
      fast6:     { label: 'High-frequency 6-core CPU (fast per-core speed for fps)', price: [220, 300], tier: 2 },
      fast68:    { label: 'Fast 6–8 core CPU',                                     price: [280, 380],   tier: 2 },
      core8:     { label: '8-core CPU',                                            price: [300, 400],   tier: 2 },
      balanced8: { label: '8-core CPU, balanced',                                  price: [300, 400],   tier: 2 },
      audio:     { label: 'High-frequency CPU (low audio latency)',                price: [300, 420],   tier: 2 },
      core12:    { label: '12-core CPU',                                           price: [450, 600],   tier: 3 },
      highCore:  { label: 'High-core-count CPU',                                   price: [450, 650],   tier: 3 },
      keepUp:    { label: 'High-core-count CPU to keep up',                        price: [450, 650],   tier: 3 },
      editor:    { label: 'High-core-count CPU (fast timeline scrubbing & export)', price: [450, 650],  tier: 3 },
      server:    { label: 'High-core-count server-class CPU',                      price: [1200, 2400], tier: 5 }
    },

    gpu: {
      igpu:        { label: 'Integrated graphics',                                       price: [0, 0],        tier: 1 },
      entry8:      { label: 'Entry GPU, 8GB',                                            price: [200, 280],    tier: 1 },
      wsEntry:     { label: 'Entry workstation GPU',                                     price: [300, 500],    tier: 2 },
      rtx4060ti:   { label: 'RTX 4060 Ti / RX 7700 XT-class, 12–16GB',                   price: [400, 520],    tier: 2 },
      rtx4060ti16: { label: 'RTX 4060 Ti-class GPU, 16GB',                               price: [450, 560],    tier: 2 },
      rtx4070:     { label: 'RTX 4070-class GPU, 12GB (GPU-accelerated export)',         price: [580, 720],    tier: 2 },
      rtx4070ti:   { label: 'RTX 4070 Ti-class, 12–16GB',                                price: [700, 900],    tier: 3 },
      ai16:        { label: 'RTX 4070 Ti-class GPU, 16GB VRAM',                          price: [750, 950],    tier: 3 },
      vr:          { label: 'RTX 4070 Ti SUPER / 4080-class, 16GB+ (VR-ready)',          price: [850, 1300],   tier: 3 },
      rtx4080:     { label: 'RTX 4080-class GPU, 16GB (fast GPU rendering)',             price: [1100, 1400],  tier: 3 },
      rtx4080_90:  { label: 'RTX 4080 / 4090-class, 16GB+',                              price: [1100, 1900],  tier: 3 },
      ai4090:      { label: 'RTX 4090-class GPU, 24GB VRAM (flexible headroom)',         price: [1700, 2300],  tier: 3 },
      aiDual4090:  { label: 'Dual RTX 4090-class GPUs, 48GB combined VRAM',              price: [3600, 5200],  tier: 4 },
      aiMulti:     { label: 'Multi-GPU server build, 96GB+ VRAM (4× 24GB or more)',      price: [7500, 14000], tier: 5 }
    },

    ram: {
      gb8:   { label: '8GB',   price: [30, 45] },
      gb16:  { label: '16GB',  price: [50, 75] },
      gb32:  { label: '32GB',  price: [95, 140] },
      gb64:  { label: '64GB',  price: [190, 280] },
      gb128: { label: '128GB', price: [420, 700] }
    },

    storage: {
      ssd512:      { label: '512GB SSD',                        price: [40, 60] },
      ssd1tb:      { label: '1TB SSD',                          price: [65, 90] },
      ssd2tb:      { label: '2TB SSD',                          price: [110, 160] },
      nvme1tb:     { label: '1TB NVMe SSD',                     price: [75, 110] },
      nvme2tb:     { label: '2TB NVMe SSD',                     price: [130, 190] },
      nvme4tb:     { label: '4TB NVMe SSD',                     price: [260, 380] },
      nvme2tbBulk: { label: '2TB NVMe SSD + bulk storage',      price: [230, 340] },
      nvme4tbBulk: { label: '4TB+ NVMe SSD + bulk HDD',         price: [340, 520] },
      nvme4tbRaid: { label: '4TB+ NVMe SSD + RAID storage',     price: [700, 1200] },
      nvme8tbNet:  { label: '8TB+ NVMe SSD + network storage',  price: [900, 1800] }
    },

    cooling: {
      stock: { label: 'Standard air cooling',                 price: [25, 45] },
      air:   { label: 'High-performance air cooler',          price: [45, 90] },
      quiet: { label: 'Whisper-quiet air cooling',            price: [60, 110] },
      airAi: { label: 'High-performance air cooling',         price: [70, 140] },
      aio:   { label: '240–360mm AIO liquid cooler',          price: [110, 200] },
      loop:  { label: 'Custom liquid loop (extreme cooling)', price: [450, 900], mods: ['customLoop'] }
    },

    "case": {
      minimal:     { label: 'Minimal case',                      price: [55, 100] },
      office:      { label: 'Clean case, visible on-site',       price: [90, 160] },
      dampened:    { label: 'Sound-dampened case',               price: [90, 160] },
      minimalQuiet:{ label: 'Minimal case, sound-dampened',      price: [90, 160] },
      workstation: { label: 'Minimal workstation case',          price: [110, 190] },
      sff:         { label: 'Compact SFF case',                  price: [110, 200] },
      glassRgb:    { label: 'Tempered-glass case, RGB fans',     price: [110, 220], mods: ['showpiece'] },
      serverQuiet: { label: 'Quiet, minimal server-style case',  price: [130, 240] },
      rack:        { label: 'Rack-mountable chassis',            price: [250, 600], mods: ['rackMount'] }
    }
  };

  // Motherboard, PSU, fans, OS, cabling — sized to the highest-tier part in
  // the build. First entry whose maxTier covers the build tier wins.
  var platform = [
    { maxTier: 1, label: 'Office platform (board, 550W PSU, OS, cabling)',        price: [260, 380] },
    { maxTier: 2, label: 'Mainstream platform (board, 750W PSU, OS, cabling)',    price: [380, 560] },
    { maxTier: 3, label: 'High-end platform (board, 1000W PSU, OS, cabling)',     price: [520, 760] },
    { maxTier: 4, label: 'Dual-GPU platform (HEDT board, 1600W PSU, OS)',         price: [900, 1400] },
    { maxTier: 5, label: 'Multi-GPU server platform (server board, redundant PSU)', price: [1800, 3200] }
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
    }
  };

  var laborModifiers = {
    customLoop: { fee: 450, label: 'Custom liquid loop' },
    showpiece:  { fee: 100, label: 'Showpiece build (custom cables, cable management)' },
    rackMount:  { fee: 200, label: 'Rack mounting' }
  };

  var SLOTS = ['cpu', 'gpu', 'ram', 'storage', 'cooling', 'case'];

  function roundTo(n, step) {
    return Math.round(n / step) * step;
  }

  function laborFor(track, tier) {
    if (track === 'ai') {
      return labor.ai.byTier[tier] || labor.ai.fallback;
    }
    return labor[track] || null;
  }

  // Returns null until at least one part is known, so the UI can stay quiet
  // rather than showing a confident $0.
  function estimate(build) {
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

    partsLo *= (1 + PARTS_HANDLING);
    partsHi *= (1 + PARTS_HANDLING);

    var plat = null;
    for (var i = 0; i < platform.length; i++) {
      if (tier <= platform[i].maxTier) { plat = platform[i]; break; }
    }
    if (!plat) plat = platform[platform.length - 1];

    var base = laborFor(build.track, tier);
    var laborTotal = base ? base.fee : 0;
    var modLines = mods.map(function (m) {
      var mod = laborModifiers[m];
      if (mod) laborTotal += mod.fee;
      return mod;
    }).filter(Boolean);

    var lo = partsLo + plat.price[0] + laborTotal;
    var hi = partsHi + plat.price[1] + laborTotal;

    return {
      asOf: AS_OF,
      known: known,
      slotCount: SLOTS.length,
      complete: known === SLOTS.length,
      tier: tier,
      parts: [Math.round(partsLo), Math.round(partsHi)],
      platform: plat,
      labor: base,
      laborModifiers: modLines,
      laborTotal: laborTotal,
      // Rounded to the nearest $25 — the inputs aren't precise enough to
      // justify a figure that looks like it is.
      total: [roundTo(lo, 25), roundTo(hi, 25)]
    };
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

  window.AHERN_PRICING = {
    asOf: AS_OF,
    parts: parts,
    platform: platform,
    labor: labor,
    laborModifiers: laborModifiers,
    estimate: estimate,
    money: money,
    range: range
  };
})();
