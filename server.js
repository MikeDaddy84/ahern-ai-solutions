const path = require('path');
const express = require('express');

const db = require('./lib/db');
const blog = require('./lib/blog');
const seo = require('./lib/seo');
const pages = require('./lib/pages');
const gate = require('./lib/gate');
const leads = require('./lib/leads');
const contact = require('./lib/contact');
const notifications = require('./lib/notifications');
const { renderPage, escapeHtml } = require('./lib/layout');
const { services, serviceHtml } = require('./lib/services');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Last-resort process guards ----------
// A stray rejected promise anywhere in the tree used to be fatal: Node >=15
// escalates an unhandled rejection to an uncaught exception and the process
// dies. On a single-instance free plan that is the whole site gone, usually
// over something as minor as a database timeout. Log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection (site continues):', reason);
});

// Uncaught exceptions are different — after one, application state may be
// garbage, so the textbook answer is to exit and let Render restart. That is
// still right for real bugs, but not for transient socket noise, which would
// just restart-loop the site. So: shrug off network errors, die on everything
// else.
const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'
]);
process.on('uncaughtException', (err) => {
  const code = (err && err.code) || (err && err.cause && err.cause.code) || '';
  const transient = TRANSIENT_CODES.has(code) || String(code).startsWith('UND_ERR_');
  if (transient) {
    console.error('[process] transient uncaught exception (site continues):', err);
    return;
  }
  console.error('[process] fatal uncaught exception, exiting for restart:', err);
  process.exit(1);
});

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
// Only the browser build is public. No CDN requests or server package files.
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three-addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));

// ---------- Blog ----------
// Post dates are date-only strings, which Date parses as UTC midnight. Rendered
// in a US timezone that lands on the previous evening, so a post dated the 30th
// displayed as the 29th — and disagreed with the <time datetime> attribute and
// the sitemap's lastmod, both of which are correct. Formatting in UTC keeps the
// three in step.
const POST_DATE_FORMAT = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };

app.get('/blog', (req, res) => {
  const posts = blog.listPosts();
  const cards = posts
    .map(
      (p) => `
    <a class="blog-card" href="/blog/${encodeURIComponent(p.slug)}">
      <span class="tag">${escapeHtml(p.tag)}</span>
      <h2>${escapeHtml(p.title)}</h2>
      <p>${escapeHtml(p.excerpt)}</p>
      ${p.date ? `<time datetime="${escapeHtml(p.date)}">${escapeHtml(new Date(p.date).toLocaleDateString('en-US', POST_DATE_FORMAT))}</time>` : ''}
    </a>`
    )
    .join('\n');

  const body = `
    <section class="container blog-hero">
      <p class="eyebrow">Reference builds</p>
      <h1>How this work gets built</h1>
      <p>Automation, hardware, and private-AI builds worked through end to end — the problem, the components, the cost, and the honest trade. Written from real pricing, not from past engagements.</p>
    </section>
    <section class="container">
      ${posts.length ? `<div class="blog-list">${cards}</div>` : '<p class="blog-empty">No posts yet — check back soon.</p>'}
    </section>
  `;

  res.send(renderPage({ title: 'Blog — Ahern AI', description: 'Reference builds in AI automation, custom PCs, and private local AI systems — how each one is put together and what it costs.', canonicalPath: '/blog', bodyHtml: body }));
});

app.get('/blog/:slug', (req, res) => {
  const post = blog.getPost(req.params.slug);
  if (!post) return res.status(404).send(renderPage({ title: 'Not found — Ahern AI', description: 'Page not found.', bodyHtml: '<section class="container post"><p>Post not found.</p><p><a href="/blog">&larr; Back to the blog</a></p></section>' }));

  const dateStr = post.date ? new Date(post.date).toLocaleDateString('en-US', POST_DATE_FORMAT) : '';
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

  res.send(renderPage({ title: `${post.title} — Ahern AI`, description: post.excerpt || post.title, canonicalPath: `/blog/${encodeURIComponent(post.slug)}`, ogType: 'article', jsonLd: seo.blogPostingSchema(post), bodyHtml: body }));
});

// ---------- Content pages ----------
app.get('/services/:service', (req, res, next) => {
  const service = services[req.params.service];
  if (!service) return next();
  res.send(renderPage({ title: service.title + ' — Ahern AI', description: service.intro,
    canonicalPath: '/services/' + req.params.service, bodyHtml: serviceHtml(req.params.service),
    scripts: req.params.service === 'automation' ? ['/workflow-demo.js?v=workflow-2'] :
      req.params.service === 'custom-pcs' ? ['/pricing.js?v=sept2026-2'] : [] }));
});
// Server-rendered rather than static files so they pick up the same chrome,
// canonical and OG tags as everything else. Both sit behind the gate like the
// rest of the site.
app.get('/about', (req, res) => {
  res.send(renderPage({
    title: 'About — Ahern AI',
    description: 'One person handling AI automation, custom PCs, and private local AI for North Texas businesses. Who you are dealing with, and where this business actually is.',
    canonicalPath: '/about',
    bodyHtml: pages.aboutHtml()
  }));
});

app.get('/privacy', (req, res) => {
  res.send(renderPage({
    title: 'Privacy — Ahern AI',
    description: 'What this site collects, in plain English: a contact form you chose to fill in, and anonymous page counts. No advertising trackers; nothing sold.',
    canonicalPath: '/privacy',
    bodyHtml: pages.privacyHtml()
  }));
});

// ---------- API: contact form ----------
app.post('/api/contact', contact.rateLimit(), async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (req.body?.botcheck) return res.json({ ok: true, persisted: true });
    let validated;
    try { validated = contact.validate(req.body); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const result = await db.withClient(client => leads.accept(client, {
      ...validated.lead,
      // Store path only; builder query strings can contain the full brief.
      referrer: safeReferrer(req.get('referer')),
      userAgent: (req.get('user-agent') || '').slice(0, 300)
    }, validated.requestId));
    res.json({ ok: true, persisted: true, reference: result.id });
    flushNotifications();
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: 'This request was already received with different details. Reload the page before sending a new request.' });
    console.error('[contact] persistence unavailable');
    res.status(503).json({ error: 'Your request could not be saved. Your details are still in the form—please try again, or call or text (940) 329-9337.' });
  }
});

function safeReferrer(value) {
  try { const u = new URL(value); return (u.origin + u.pathname).slice(0, 300); }
  catch (_) { return null; }
}

let flushing = false;
let sender;
async function flushNotifications() {
  if (flushing || !notifications.configured() || !db.isEnabled()) return;
  flushing = true;
  try {
    sender ||= notifications.createSender();
    await db.withClient(client => leads.deliverBatch(client, sender));
  } catch (_) { console.error('[notifications] queue unavailable; retrying on next cycle'); }
  finally { flushing = false; }
}

app.get('/leads', contact.rateLimit({ limit: 30 }), contact.adminAuth, async (req, res) => {
  try {
    const rows = await db.withClient(leads.list);
    const cards = rows.map(row => `<article class="lead-card"><div class="lead-meta"><strong>#${row.id} · ${escapeHtml(row.name)}</strong><span>${escapeHtml(row.created_at)} UTC</span></div>
      <p>${escapeHtml(row.email)} · ${escapeHtml(row.business || 'Individual')} · ${escapeHtml(row.interest)}</p>
      <p class="lead-message">${escapeHtml(row.message || '(No message)')}</p><p class="form-note">${escapeHtml(row.delivery)}${row.last_error ? ' · ' + escapeHtml(row.last_error) : ''}</p></article>`).join('');
    // Standalone admin HTML avoids analytics, third-party fonts and external requests.
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Inquiries — Ahern AI</title><link rel="stylesheet" href="/styles.css?v=studio-1"><link rel="stylesheet" href="/experience.css?v=studio-1"></head><body><main class="container section"><h1>Consultation requests</h1><p>Latest 100 inquiries · ${notifications.configured() ? 'Email delivery configured' : 'Email delivery needs configuration; requests are saved here'}</p>${cards || '<p>No inquiries yet.</p>'}</main></body></html>`);
  } catch (_) { res.status(503).send('Inquiry storage is temporarily unavailable. Please retry.'); }
});

// ---------- API: first-party analytics beacon ----------
app.post('/api/track', async (req, res) => {
  try {
    const { path: p, referrer } = req.body || {};
    await db.insertPageview({
      path: p ? String(p).slice(0, 300) : '/',
      referrer: safeReferrer(referrer),
      userAgent: req.get('user-agent') || null
    });
    res.status(204).end();
  } catch (err) {
    // Analytics failures should never surface to the visitor.
    res.status(204).end();
  }
});

// The old version reported db:true whenever the env var was a non-empty
// string, which meant it printed "connected" while the connection was in fact
// timing out. It now reports what the connection is actually doing.
app.get('/health', (req, res) => {
  res.json({ ok: true, db: db.status() });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Ahern AI site running at http://localhost:${PORT} (db: ${db.status().state})`));
  const notificationTimer = setInterval(flushNotifications, 60000);
  notificationTimer.unref();
  flushNotifications();
}
module.exports = app;
