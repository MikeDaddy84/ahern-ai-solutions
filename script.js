// Ahern AI Solutions — theme toggle + header scroll state
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('[data-theme-toggle]');

  var sunSVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var moonSVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = prefersDark ? 'dark' : 'light';
  applyTheme(theme);

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (toggle) {
      toggle.innerHTML = t === 'dark' ? sunSVG : moonSVG;
      toggle.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' mode');
    }
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
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

  // Web3Forms: native POST redirects back with ?success=1 — show thank-you state
  var params = new URLSearchParams(window.location.search);
  if (params.get('success') === '1') {
    var form = document.getElementById('audit-form');
    var success = document.getElementById('audit-success');
    var heading = document.querySelector('#audit .section-title');
    if (form) form.style.display = 'none';
    if (success) success.hidden = false;
    if (heading) heading.textContent = 'Your consultation request is in.';
    // clean the URL
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname + '#audit');
    }
  }
})();
