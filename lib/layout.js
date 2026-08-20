// Shared page chrome (head, header, footer, background effects) for
// server-rendered pages — currently just the blog. Keeps the blog visually
// identical to the static homepage without duplicating markup everywhere.

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
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
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2301696F'/%3E%3Cpath d='M16 7l8 18h-4l-1.6-4H11l-1.6 4H6L14 7h2zm0 6.5L13 19h6l-3-5.5z' fill='%23F7F6F2'/%3E%3C/svg%3E" />
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
        <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d="M16 7l8 18h-4l-1.6-4H11l-1.6 4H6L14 7h2zm0 6.5L13 19h6l-3-5.5z" fill="var(--color-bg)" />
        </svg>
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
          <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="currentColor" />
            <path d="M16 7l8 18h-4l-1.6-4H11l-1.6 4H6L14 7h2zm0 6.5L13 19h6l-3-5.5z" fill="var(--color-bg)" />
          </svg>
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
