// Pre-launch gate.
//
// While SITE_GATE_PASSWORD is set, the whole site sits behind a password and
// nothing is indexable. Unset that one variable in Render and the gate
// disappears — the same switch also flips robots.txt from "Disallow: /" to a
// real one, un-404s the sitemap, and drops the noindex header (see server.js).
// So "go live" is one env var, not a checklist you can half-finish.

const crypto = require('crypto');
const express = require('express');

const COOKIE_NAME = 'ahern_gate';
const TOKEN_SALT = 'ahern-gate-v1';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days.

// The gate page renders with these, so they have to answer before anyone has
// a cookie. /health stays open so the platform can check the service without
// tripping the gate.
const ALLOWED_PATHS = new Set([
  '/health',
  '/robots.txt',
  '/styles.css',
  '/brand/logo.png',
  '/brand/favicon.png'
]);

function gatePassword() {
  return process.env.SITE_GATE_PASSWORD || '';
}

function isEnabled() {
  return gatePassword().length > 0;
}

// The cookie carries a hash of the password, never the password itself.
// Rotating SITE_GATE_PASSWORD changes the hash, which invalidates every cookie
// already issued — so revoking access is the same one-field edit as changing
// it.
function expectedToken() {
  return crypto.createHmac('sha256', gatePassword()).update(TOKEN_SALT).digest('hex');
}

function safeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function hasValidCookie(req) {
  const token = readCookie(req, COOKIE_NAME);
  return Boolean(token) && safeEquals(token, expectedToken());
}

function grantAccess(req, res) {
  const secure = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  res.cookie(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: COOKIE_MAX_AGE_MS
  });
}

// A password on a public URL gets found by scanners eventually. This isn't
// meant to stop a determined attacker — there's nothing behind it worth
// stealing yet — just to make guessing slower than giving up.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 1000 * 60 * 10;

function attemptKey(req) {
  return (req.get('x-forwarded-for') || req.ip || 'unknown').split(',')[0].trim();
}

function isLockedOut(req) {
  const key = attemptKey(req);
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() > record.until) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(req) {
  const key = attemptKey(req);
  const record = attempts.get(key) || { count: 0, until: 0 };
  record.count += 1;
  record.until = Date.now() + LOCKOUT_MS;
  attempts.set(key, record);
}

function clearFailures(req) {
  attempts.delete(attemptKey(req));
}

function escapeAttr(str) {
  return String(str || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Deliberately self-contained rather than routed through renderPage(): the
// gate shows the brand but not the nav, the footer, or anything else a
// visitor isn't supposed to reach yet.
function renderGatePage({ error, next }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Ahern AI Solutions</title>
  <link rel="icon" type="image/png" href="/brand/favicon.png" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 2rem 1.5rem; background: #0a0d0c; color: #d3ded8;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background-image:
        radial-gradient(60rem 30rem at 50% -10%, rgba(0, 229, 160, 0.10), transparent 70%),
        radial-gradient(40rem 24rem at 90% 110%, rgba(44, 160, 255, 0.08), transparent 70%);
    }
    .card { width: 100%; max-width: 26rem; text-align: center; }
    .logo { width: 100%; max-width: 15rem; height: auto; margin: 0 auto 2rem; display: block; }
    h1 { font-size: 1.35rem; font-weight: 700; margin: 0 0 0.6rem; letter-spacing: -0.01em; }
    p { margin: 0 0 1.75rem; color: #8ea69b; line-height: 1.6; font-size: 0.95rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    input {
      width: 100%; padding: 0.8rem 1rem; font-size: 1rem; font-family: inherit;
      color: #d3ded8; background: rgba(255, 255, 255, 0.04);
      border: 1px solid #24312c; border-radius: 0.6rem;
    }
    input:focus { outline: 2px solid #00e5a0; outline-offset: 1px; border-color: transparent; }
    button {
      padding: 0.8rem 1rem; font-size: 1rem; font-weight: 600; font-family: inherit;
      color: #06211a; background: #00e5a0; border: 0; border-radius: 0.6rem; cursor: pointer;
    }
    button:hover { background: #4dffc2; }
    .error { color: #ff8a2e; font-size: 0.9rem; margin: 0.25rem 0 0; }
    .contact { margin: 2.25rem 0 0; font-size: 0.85rem; color: #4d615a; }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/brand/logo.png" alt="Ahern AI Solutions" />
    <h1>Launching soon</h1>
    <p>The site isn&#39;t public yet. If you were given a password, enter it below.</p>
    <form method="POST" action="/__gate">
      <input type="hidden" name="next" value="${escapeAttr(next)}" />
      <input
        type="password"
        name="password"
        aria-label="Access password"
        placeholder="Password"
        autocomplete="current-password"
        autofocus
        required
      />
      <button type="submit">Enter</button>
      ${error ? `<p class="error">${escapeAttr(error)}</p>` : ''}
    </form>
    <!-- No phone number, no email, no contact form. The point of the gate is
         that nobody reaches out before the site is ready; printing a way to
         get in touch here would undo it. -->
    <p class="contact">Ahern AI Solutions</p>
  </main>
</body>
</html>`;
}

// Only ever redirect to a path on this site. Without this check, a link like
// /?next=https://example.com would turn the gate into an open redirect.
function safeNext(value) {
  const raw = String(value || '/');
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function createGate() {
  const router = express.Router();

  router.post('/__gate', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!isEnabled()) return res.redirect('/');

    const next = safeNext(req.body && req.body.next);

    if (isLockedOut(req)) {
      return res
        .status(429)
        .send(renderGatePage({ error: 'Too many attempts. Try again in a few minutes.', next }));
    }

    if (safeEquals(String((req.body && req.body.password) || ''), gatePassword())) {
      clearFailures(req);
      grantAccess(req, res);
      return res.redirect(next);
    }

    recordFailure(req);
    return res.status(401).send(renderGatePage({ error: 'That password is not right.', next }));
  });

  router.use((req, res, next) => {
    if (!isEnabled()) return next();

    // Nothing behind the gate should ever be indexed, even if a crawler gets a
    // URL from somewhere other than this site.
    res.set('X-Robots-Tag', 'noindex, nofollow');

    if (ALLOWED_PATHS.has(req.path)) return next();
    if (hasValidCookie(req)) return next();

    // ?gate=<password> makes the gate shareable as a single link — hand
    // someone a URL and they're in, with no separate password to relay.
    if (req.query.gate && safeEquals(String(req.query.gate), gatePassword())) {
      clearFailures(req);
      grantAccess(req, res);
      return res.redirect(req.path);
    }

    // An API call behind the gate should fail like an API, not hand back a
    // login page the caller will try to parse as JSON.
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not available yet.' });
    }

    return res.status(401).send(renderGatePage({ error: '', next: safeNext(req.originalUrl) }));
  });

  return router;
}

module.exports = { createGate, isEnabled };
