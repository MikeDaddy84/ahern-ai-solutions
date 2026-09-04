// Ahern AI — theme toggle, header scroll state, contact form,
// pageview beacon, and the matrix-rain background effect.
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('[data-theme-toggle]');

  var sunSVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var moonSVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var stored = null;
  try { stored = localStorage.getItem('ahern-theme'); } catch (e) {}
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (toggle) {
      toggle.innerHTML = t === 'dark' ? sunSVG : moonSVG;
      toggle.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' mode');
    }
    document.dispatchEvent(new CustomEvent('ahern-theme-change', { detail: { theme: t } }));
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try { localStorage.setItem('ahern-theme', theme); } catch (e) {}
    });
  }

  // Header shadow on scroll
  var header = document.getElementById('header');
  var onScroll = function () {
    if (!header) return;
    if (window.scrollY > 8) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- Prefill from the PC Builder sandbox (?interest=&build=) ----------
  (function prefillFromBuilder() {
    var params = new URLSearchParams(location.search);
    var interest = params.get('interest');
    var buildSummary = params.get('build');
    if (!interest && !buildSummary) return;
    var interestSelect = document.getElementById('interest');
    var msg = document.getElementById('msg');
    if (interestSelect && interest) {
      var hasOption = Array.prototype.some.call(interestSelect.options, function (o) { return o.value === interest; });
      if (hasOption) interestSelect.value = interest;
    }
    if (msg && buildSummary && !msg.value) msg.value = buildSummary;
  })();

  // ---------- Contact form -> /api/contact ----------
  var form = document.getElementById('audit-form');
  var result = document.getElementById('form-result');
  var success = document.getElementById('audit-success');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Honeypot: if a bot filled this hidden field, silently pretend success.
      var honeypot = form.querySelector('[name="botcheck"]');
      if (honeypot && honeypot.checked) {
        showSuccess();
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        business: form.business.value.trim(),
        interest: form.interest.value,
        message: form.message.value.trim()
      };

      if (!data.name || !data.email || !data.interest) {
        showResult('error', 'Please fill in your name, email, and what you’re interested in.');
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (r) {
          if (r.ok) {
            showSuccess();
          } else {
            showResult('error', r.body && r.body.error ? r.body.error : 'Something went wrong. Please call or text instead.');
          }
        })
        .catch(function () {
          showResult('error', 'Network error — please call or text instead.');
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request my free consultation'; }
        });
    });
  }

  function showResult(kind, message) {
    if (!result) return;
    result.textContent = message;
    result.className = 'form-result ' + kind;
  }

  function showSuccess() {
    var heading = document.querySelector('#audit .section-title');
    if (form) form.style.display = 'none';
    if (success) success.hidden = false;
    if (heading) heading.textContent = 'Your consultation request is in.';
  }

  // ---------- Lightweight first-party pageview beacon -> /api/track ----------
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: location.pathname, referrer: document.referrer || null }),
    keepalive: true
  }).catch(function () {});

  // ---------- Matrix rain background ----------
  initMatrixRain();

  function initMatrixRain() {
    var canvas = document.getElementById('matrix-rain');
    if (!canvas || !canvas.getContext) return;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    var ctx = canvas.getContext('2d');
    var chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ01アAIΣΔΩ';
    var fontSize = 15;
    var columns = 0;
    var drops = [];
    var speeds = []; // rows/frame, per column — varied and slow, not a uniform sheet of rain
    var rafId = null;
    var running = false;

    function randomSpeed() {
      // ~0.04–0.26 rows/frame: at 60fps that's roughly 15–95s to cross a
      // typical viewport, vs. a flat 1 row/frame (~0.8s) before — an
      // ambient background detail, not something that grabs the eye.
      return 0.04 + Math.random() * 0.22;
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(0).map(function () { return Math.random() * -100; });
      speeds = new Array(columns).fill(0).map(randomSpeed);
    }

    function draw() {
      var isDark = root.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDark ? 'rgba(10, 12, 11, 0.08)' : 'rgba(247, 246, 242, 0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSize + 'px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = isDark ? 'rgba(0, 229, 160, 0.55)' : 'rgba(1, 105, 111, 0.28)';

      for (var i = 0; i < drops.length; i++) {
        var text = chars[Math.floor(Math.random() * chars.length)];
        var x = i * fontSize;
        var y = drops[i] * fontSize;
        ctx.fillText(text, x, y);
        if (y > canvas.height && Math.random() > 0.985) {
          drops[i] = Math.random() * -20;
          speeds[i] = randomSpeed(); // re-roll so a column doesn't keep the same pace forever
        }
        drops[i] += speeds[i];
      }
      rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(draw);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    resize();
    start();
    window.addEventListener('resize', resize, { passive: true });

    // Pause when tab is hidden to save battery/CPU.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  // ---------- Hero build demo ----------
  // One question from the PC Builder, answerable in the hero, priced by the
  // real model. Every figure here comes out of AHERN_PRICING — nothing is
  // hardcoded — so it can't drift away from the builder the way a typed-in
  // number would. Answering carries the choice into the full flow.
  initHeroDemo();

  function initHeroDemo() {
    var demo = document.getElementById('hero-demo');
    var out = document.getElementById('hero-demo-out');
    if (!demo || !out) return;

    var buttons = demo.querySelectorAll('.hero-opt');
    var PRICING = window.AHERN_PRICING;

    // Without the pricing model the buttons still do something useful — they
    // just hand off to the builder instead of quoting. A broken demo above
    // the fold would be worse than no demo.
    if (!PRICING) {
      Array.prototype.forEach.call(buttons, function (btn) {
        btn.addEventListener('click', function () {
          window.location.href = '/pc-builder?track=' + btn.getAttribute('data-track');
        });
      });
      return;
    }

    var P = PRICING.parts;

    // A representative mid-range build per track — roughly what the middle
    // answers in the real builder produce. Labelled "typical" on screen
    // because that is exactly what it is.
    var TYPICAL = {
      gaming: {
        title: 'Gaming PC · 1440p, high detail',
        build: { track: 'gaming', cpu: P.cpu.balanced8, gpu: P.gpu.game1440, ram: P.ram.gb32,
                 storage: P.storage.nvme2tb, cooling: P.cooling.air, "case": P['case'].glassRgb }
      },
      creative: {
        title: 'Creator workstation · video editing',
        build: { track: 'creative', cpu: P.cpu.editor, gpu: P.gpu.creatorVideo, ram: P.ram.gb64,
                 storage: P.storage.nvme4tb, cooling: P.cooling.quiet, "case": P['case'].workstation }
      },
      ai: {
        title: 'Local AI workstation · 7B–14B models',
        build: { track: 'ai', cpu: P.cpu.core12, gpu: P.gpu.aiEveryday, ram: P.ram.gb64,
                 storage: P.storage.nvme2tb, cooling: P.cooling.airAi, "case": P['case'].serverQuiet }
      },
      everyday: {
        title: 'Everyday PC · office and browsing',
        build: { track: 'everyday', cpu: P.cpu.eff6, gpu: P.gpu.igpu, ram: P.ram.gb16,
                 storage: P.storage.ssd512, cooling: P.cooling.stock, "case": P['case'].minimal }
      }
    };

    function esc(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function render(track) {
      var spec = TYPICAL[track];
      if (!spec) return;
      var est = PRICING.estimate(spec.build);
      if (!est) return;

      var rows = [
        ['gpu', spec.build.gpu.label],
        ['cpu', spec.build.cpu.label],
        ['ram', spec.build.ram.label + ' memory']
      ];

      out.innerHTML =
        '<p class="t-line hero-demo-title">' + esc(spec.title) + '</p>' +
        rows.map(function (r) {
          return '<p class="t-line t-out"><span class="t-prompt">' + esc(r[0]) + '</span>' + esc(r[1]) + '</p>';
        }).join('') +
        '<p class="t-line hero-demo-est"><span class="t-prompt">est</span>' +
          '<strong>' + esc(PRICING.range(est.total)) + '</strong></p>' +
        '<p class="hero-demo-fine">Typical build, ' + esc(PRICING.asOf) + ' pricing &mdash; parts plus ' +
          esc(PRICING.pct(est.handlingPct)) + ' handling and the build fee. Yours is priced on your answers.</p>' +
        '<a class="hero-demo-cta" href="/pc-builder?track=' + esc(track) + '">Build this one properly <span aria-hidden="true">&rarr;</span></a>';
    }

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(buttons, function (b) {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        render(btn.getAttribute('data-track'));
      });
      btn.setAttribute('aria-pressed', 'false');
    });

    // Render one on load rather than waiting for a click. The point of
    // putting this above the fold is that a visitor sees working software
    // immediately — an empty box they have to poke first proves nothing, and
    // leaves a dead rectangle in the hero. Local AI is the default because
    // it's the pillar nobody else round here offers; change DEFAULT_TRACK to
    // lead with something else.
    var DEFAULT_TRACK = 'ai';
    var initial = demo.querySelector('.hero-opt[data-track="' + DEFAULT_TRACK + '"]');
    if (initial) {
      initial.classList.add('is-active');
      initial.setAttribute('aria-pressed', 'true');
      render(DEFAULT_TRACK);
    }
  }

})();
