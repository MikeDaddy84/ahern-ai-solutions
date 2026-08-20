// Shared page chrome (head, header, footer, background effects) for
// server-rendered pages — currently just the blog. Keeps the blog visually
// identical to the static homepage without duplicating markup everywhere.

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// The "A" mark, in the site's real brand colors (navy/blue/orange). Gradient
// ids must be unique per <svg> instance on a page, hence the suffix.
function logoMarkSvg(suffix) {
  return `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="ahernNavy${suffix}" x1="16" y1="4" x2="6" y2="27" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#3A4653" /><stop offset="1" stop-color="#202932" />
            </linearGradient>
            <linearGradient id="ahernBlue${suffix}" x1="16" y1="4" x2="27" y2="27" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#2CA0FF" /><stop offset="1" stop-color="#0072E8" />
            </linearGradient>
            <linearGradient id="ahernOrange${suffix}" x1="16" y1="15" x2="16" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#FF8A2E" /><stop offset="1" stop-color="#E85400" />
            </linearGradient>
          </defs>
          <path d="M16 4 L6 27" fill="none" stroke="url(#ahernNavy${suffix})" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16 4 L26 27" fill="none" stroke="url(#ahernBlue${suffix})" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16 15 L11.5 24 L20.5 24 Z" fill="url(#ahernOrange${suffix})" stroke="rgba(0,0,0,.28)" stroke-width="0.5" stroke-linejoin="round" />
        </svg>`;
}

function renderPage({ title, description, bodyHtml, canonicalPath }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='n' x1='16' y1='4' x2='6' y2='27' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%233A4653'/%3E%3Cstop offset='1' stop-color='%23202932'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='16' y1='4' x2='27' y2='27' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%232CA0FF'/%3E%3Cstop offset='1' stop-color='%230072E8'/%3E%3C/linearGradient%3E%3ClinearGradient id='o' x1='16' y1='15' x2='16' y2='24' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23FF8A2E'/%3E%3Cstop offset='1' stop-color='%23E85400'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M16 4 L6 27' fill='none' stroke='url(%23n)' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M16 4 L26 27' fill='none' stroke='url(%23b)' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M16 15 L11.5 24 L20.5 24 Z' fill='url(%23o)' stroke='rgba(0,0,0,.28)' stroke-width='0.5' stroke-linejoin='round'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://api.fontshare.com" />
  <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=cyberpunk-1" />
</head>
<body>
  <canvas id="matrix-rain" aria-hidden="true"></canvas>
  <div class="bg-aurora" aria-hidden="true">
    <span class="aurora-blob aurora-1"></span>
    <span class="aurora-blob aurora-2"></span>
    <span class="aurora-blob aurora-3"></span>
    <span class="aurora-blob aurora-4"></span>
  </div>
  <div class="scanlines" aria-hidden="true"></div>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="header" id="header">
    <div class="container header-inner">
      <a href="/#top" class="logo" aria-label="Ahern AI Solutions home">
        ${logoMarkSvg('H')}
        <span class="logo-text">Ahern<span class="logo-accent"> AI</span></span>
      </a>
      <nav class="nav" aria-label="Primary">
        <a href="/#services">Services</a>
        <a href="/#hardware">PC builds</a>
        <a href="/#pricing">AI packages</a>
        <a href="/#process">How it works</a>
        <a href="/blog">Blog</a>
        <a href="/#faq">FAQ</a>
      </nav>
      <div class="header-actions">
        <button class="theme-toggle" data-theme-toggle aria-label="Switch to dark mode" type="button"></button>
        <a class="btn btn-primary btn-sm" href="/#audit">Free consult</a>
      </div>
    </div>
  </header>

  <main id="main">
${bodyHtml}
  </main>

  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <a href="/#top" class="logo logo-footer" aria-label="Ahern AI Solutions">
          ${logoMarkSvg('F')}
          <span class="logo-text">Ahern<span class="logo-accent"> AI</span></span>
        </a>
        <p class="footer-tag">AI automation, custom PCs, and private local AI systems.</p>
      </div>
      <nav class="footer-nav" aria-label="Footer">
        <a href="/#services">Services</a>
        <a href="/#hardware">PC builds</a>
        <a href="/#pricing">AI packages</a>
        <a href="/blog">Blog</a>
        <a href="/#faq">FAQ</a>
        <a href="/#audit">Free consultation</a>
      </nav>
      <div class="footer-meta">
        <p>Gordon, Texas · Serving the North Texas area</p>
        <p><a href="tel:+19403299337">(940) 329-9337</a></p>
        <p class="footer-fine">&copy; 2026 Ahern AI Solutions.</p>
      </div>
    </div>
  </footer>

  <script src="/script.js?v=cyberpunk-1"></script>
</body>
</html>`;
}

module.exports = { renderPage, escapeHtml };
