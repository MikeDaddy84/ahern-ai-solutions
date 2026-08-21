const path = require('path');
const express = require('express');

const db = require('./lib/db');
const blog = require('./lib/blog');
const seo = require('./lib/seo');
const gate = require('./lib/gate');
const { renderPage, escapeHtml } = require('./lib/layout');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
// Render terminates TLS at its load balancer, so without this req.protocol is
// always "http" and req.ip is the proxy — which would break the gate's secure
// cookie and collapse its rate limiting onto a single address.
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

// Before anything is served: while SITE_GATE_PASSWORD is set, this answers
// every request with a password page. See lib/gate.js.
app.use(gate.createGate());

// ---------- SEO ----------
// Both of these change shape with the gate, so neither can be a static file.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(seo.robotsTxt({ gated: gate.isEnabled() }));
});

// Unlike robots.txt this is not on the gate's allowlist, so while the gate is
// up it never gets here — a sitemap for a site that isn't public yet would be
// an invitation to index it.
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(seo.sitemapXml());
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- Blog ----------
app.get('/blog', (req, res) => {
  const posts = blog.listPosts();
  const cards = posts
    .map(
      (p) => `
    <a class="blog-card" href="/blog/${encodeURIComponent(p.slug)}">
      <span class="tag">${escapeHtml(p.tag)}</span>
      <h2>${escapeHtml(p.title)}</h2>
      <p>${escapeHtml(p.excerpt)}</p>
      ${p.date ? `<time datetime="${escapeHtml(p.date)}">${escapeHtml(new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</time>` : ''}
    </a>`
    )
    .join('\n');

  const body = `
    <section class="container blog-hero">
      <p class="eyebrow">From the field</p>
      <h1>Case studies &amp; notes</h1>
      <p>Real automation, hardware, and private-AI builds — what the problem was, what we built, and what changed.</p>
    </section>
    <section class="container">
      ${posts.length ? `<div class="blog-list">${cards}</div>` : '<p class="blog-empty">No posts yet — check back soon.</p>'}
    </section>
  `;

  res.send(renderPage({ title: 'Blog — Ahern AI Solutions', description: 'Case studies in AI automation, custom PCs, and private local AI systems.', canonicalPath: '/blog', bodyHtml: body }));
});

app.get('/blog/:slug', (req, res) => {
  const post = blog.getPost(req.params.slug);
  if (!post) return res.status(404).send(renderPage({ title: 'Not found — Ahern AI Solutions', description: 'Page not found.', bodyHtml: '<section class="container post"><p>Post not found.</p><p><a href="/blog">&larr; Back to the blog</a></p></section>' }));

  const dateStr = post.date ? new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const body = `
    <article class="post container">
      <header class="post-header">
        <span class="tag">${escapeHtml(post.tag)}</span>
        <h1>${escapeHtml(post.title)}</h1>
        ${post.date ? `<time datetime="${escapeHtml(post.date)}">${escapeHtml(dateStr)}</time>` : ''}
      </header>
      <div class="post-body">${post.html}</div>
      <footer class="post-footer">
        <a href="/blog">&larr; Back to all posts</a> &nbsp;·&nbsp; <a href="/#audit">Book a free consultation</a>
      </footer>
    </article>
  `;

  res.send(renderPage({ title: `${post.title} — Ahern AI Solutions`, description: post.excerpt || post.title, canonicalPath: `/blog/${encodeURIComponent(post.slug)}`, ogType: 'article', bodyHtml: body }));
});

// ---------- API: contact form ----------
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, business, interest, message, botcheck } = req.body || {};

    // Honeypot: bots fill every field, humans never see this one.
    if (botcheck) return res.json({ ok: true });

    if (!name || !email || !interest) {
      return res.status(400).json({ error: 'Name, email, and interest are required.' });
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
    if (!emailOk) return res.status(400).json({ error: 'Please enter a valid email address.' });

    await db.insertContact({
      name: String(name).slice(0, 200),
      email: String(email).slice(0, 200),
      business: business ? String(business).slice(0, 200) : null,
      interest: interest ? String(interest).slice(0, 100) : null,
      message: message ? String(message).slice(0, 4000) : null,
      referrer: req.get('referer') || null,
      userAgent: req.get('user-agent') || null
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[contact] failed:', err);
    res.status(500).json({ error: 'Something went wrong on our end. Please call or text instead.' });
  }
});

// ---------- API: first-party analytics beacon ----------
app.post('/api/track', async (req, res) => {
  try {
    const { path: p, referrer } = req.body || {};
    await db.insertPageview({
      path: p ? String(p).slice(0, 300) : '/',
      referrer: referrer ? String(referrer).slice(0, 300) : null,
      userAgent: req.get('user-agent') || null
    });
    res.status(204).end();
  } catch (err) {
    // Analytics failures should never surface to the visitor.
    res.status(204).end();
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, db: db.isEnabled() });
});

app.listen(PORT, () => {
  console.log(`Ahern AI Solutions site running on port ${PORT} (db: ${db.isEnabled() ? 'connected' : 'not configured'})`);
});
