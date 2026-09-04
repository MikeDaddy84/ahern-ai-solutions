// Shared page chrome (head, header, footer, background effects) for
// server-rendered pages — currently just the blog. Keeps the blog visually
// identical to the static homepage without duplicating markup everywhere.

const { absoluteUrl } = require('./seo');

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderPage({ title, description, bodyHtml, canonicalPath, ogType }) {
  // Every page needs a canonical: /pc-builder hands out share links carrying a
  // #b=… build hash, and the blog is reachable with tracking params on the
  // end. Without this, each variant looks like a separate page.
  const canonical = absoluteUrl(canonicalPath || '/');

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="${escapeHtml(ogType || 'website')}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:site_name" content="Ahern AI" />
  <meta property="og:image" content="${escapeHtml(absoluteUrl('/brand/og-image.png'))}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Ahern AI" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(absoluteUrl('/brand/og-image.png'))}" />
  <link rel="icon" type="image/png" href="/brand/favicon.png" />
  <link rel="preconnect" href="https://api.fontshare.com" />
  <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=web-pillar-2" />
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
      <a href="/#top" class="logo" aria-label="Ahern AI home">
        <span class="logo-mark"></span>
        <span class="logo-type">Ahern AI</span>
      </a>
      <nav class="nav" aria-label="Primary">
        <a href="/#services">Services</a>
        <a href="/pc-builder">PC Builder</a>
        <a href="/#pricing">AI packages</a>
        <a href="/#web">Websites</a>
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
        <a href="/#top" class="logo logo-footer" aria-label="Ahern AI">
          <span class="logo-mark"></span>
          <span class="logo-type">Ahern AI</span>
        </a>
        <p class="footer-tag">AI automation, custom PCs, and private local AI systems.</p>
      </div>
      <nav class="footer-nav" aria-label="Footer">
        <a href="/#services">Services</a>
        <a href="/#hardware">PC builds</a>
        <a href="/pc-builder">PC Builder</a>
        <a href="/#pricing">AI packages</a>
        <a href="/#web">Websites</a>
        <a href="/#process">How it works</a>
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

  <script src="/script.js?v=web-pillar-2"></script>
</body>
</html>`;
}

module.exports = { renderPage, escapeHtml };
