# Ahern AI Solutions — Website

Node/Express site for Ahern AI Solutions: AI automation, custom PCs, and
private local AI systems, based in Gordon, TX.

## Stack

- **Server:** Express (Node ≥18), serves the static homepage plus a
  Markdown-backed blog and two small JSON APIs.
- **Database:** [Turso](https://turso.tech) (libSQL) — contact form
  submissions and first-party pageview analytics.
- **Booking:** none — the contact form is the only inbound path.
- **Hosting:** Render (Web Service, free tier).

## Brand

The "A" mark (header, footer, favicon) uses colors sampled directly from the
company logo — navy `#3A4653→#202932`, blue `#2CA0FF→#0072E8`, orange
`#FF8A2E→#E85400` (dark-theme values; light theme uses slightly deeper
variants of the same three, see the `--color-navy` / `--color-blue` /
`--color-orange` tokens in [public/styles.css](public/styles.css)). It's
built as an inline SVG in [public/index.html](public/index.html) and
[lib/layout.js](lib/layout.js) (`logoMarkSvg()`), not a raster image, so it
stays crisp from favicon size up.

The site's primary accent stays the cyberpunk green (`--color-primary`) for
buttons and CTAs; blue and orange are layered in as secondary accents
(blue for inline text links and nav hover, orange for the pricing "featured"
badge) rather than a full palette swap.

## Local development

```bash
npm install
node server.js
```

Runs on `http://localhost:3000`. Without `TURSO_DATABASE_URL` set, the
contact form and analytics endpoints work fine but silently don't persist
anything (a warning is logged) — useful for local UI work without a DB.

## Environment variables

Set these in the Render dashboard (Environment tab) for the web service —
**not** in this repo:

| Variable | Required | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | Yes, for contact form + analytics | e.g. `libsql://your-db-name.turso.io` |
| `TURSO_AUTH_TOKEN` | Yes, for contact form + analytics | Turso auth token for that DB |
| `SITE_GATE_PASSWORD` | No | **Set = site is private.** Unset = site is public. See [Pre-launch gate](#pre-launch-gate). |
| `SITE_URL` | No | Canonical origin, default `https://ahernai.com`. Only change this if the domain changes. |
| `PORT` | No | Render sets this automatically |

Schema (`contact_submissions`, `pageviews`) is created automatically on
first boot via `CREATE TABLE IF NOT EXISTS` — no manual migration needed
once the two env vars above are set. See [lib/db.js](lib/db.js).

## Pre-launch gate

`ahernai.com` resolves to this service, so the site is reachable by anyone who
types the domain whether or not it's ready. `SITE_GATE_PASSWORD` is the switch
that decides who gets in.

**Set** (any non-empty value) → every request gets a password page instead of
the site ([lib/gate.js](lib/gate.js)), `robots.txt` becomes `Disallow: /`,
`/sitemap.xml` stops existing, and every response carries
`X-Robots-Tag: noindex, nofollow`.

**Unset** → the gate disappears, `robots.txt` opens up and advertises the
sitemap, and the sitemap starts serving.

Going live is therefore deleting one environment variable in the Render
dashboard — not a checklist that can be half-finished, which is the whole
point of routing all of it through one value. Going *back* behind the gate is
setting it again.

Notes:

- **Sharing a preview:** `https://ahernai.com/?gate=<password>` lets someone
  in without a password to relay — the link is the credential. It sets the
  cookie and redirects to the clean URL, so the password doesn't sit in their
  address bar or get passed along in a referrer header.
- **Revoking access:** change the value. The cookie holds an HMAC of the
  password, so changing it invalidates every cookie already handed out.
- **Not a security boundary.** It's a "not yet" sign with a lock on it. There
  are 8 attempts per IP per 10 minutes to make guessing tedious, but don't put
  anything behind it that would actually hurt to leak.
- `/health` stays open so Render can check the service without a password, and
  the stylesheet, logo, and favicon stay open because the gate page itself
  renders with them.
- API routes answer `401 {"error": "Not available yet."}` rather than an HTML
  password page, so a fetch from a stale tab fails as JSON instead of blowing
  up in `response.json()`.

To run the gate locally:

```bash
SITE_GATE_PASSWORD=letmein node server.js
```

## Booking

There is no self-serve scheduling. The contact form is the only way in, so
nothing lands on the calendar without a reply first — deliberate for now.
The Cal.com embed that used to sit on the homepage was removed in full
(`git log -- public/index.html` if it's ever wanted back).

**Revisit when** replying to every inquiry by hand becomes the bottleneck,
*and* there's a way to screen before a slot gets taken — the original worry
wasn't booking, it was strangers claiming time unscreened. The PC Builder's
expectation check already sorts leads before they reach you, so one likely
shape is offering a booking link only to people who finish a build, rather
than putting it on the homepage for anyone. Whatever the mechanism, the
principle holds: qualify first, then offer the calendar.

## PC Builder sandbox

`/pc-builder` is a data-driven quiz that assembles a possible build live as
the visitor answers plain-language questions. All of it lives in
[public/pc-builder.js](public/pc-builder.js) — the questions are plain data
(`PURPOSE_STEP` + `TRACKS`), and each option's `effect(build)` writes the
parts it implies. To add or reword a question, edit the data; the rendering
and navigation don't change.

The answered path is the single source of truth and it lives in the URL
hash — `#b=<track>.<index>.<index>…`, e.g.
`/pc-builder#b=ai.1.2.1.2.1.2`. That one decision buys a lot:

- **Browser back/forward** steps through questions instead of leaving the page.
- **Refresh** keeps the visitor's place.
- **A finished build is a link.** "Copy link" on the summary reopens the exact
  configuration, and the link is embedded in the message the "Get this build
  quoted" CTA pre-fills — so a quote request arrives with a one-click way to
  see the build behind it.

A malformed hash truncates at the first bad token rather than throwing, so
a mangled link still lands on a usable step.

Other entry points:

- `?track=gaming|creative|ai|everyday` skips the first question (used by the
  "Start this build" links on the homepage) and is rewritten to a `#b=` hash
  on load.
- The CTA hands off to the homepage contact form via `?interest=&build=`,
  read by `prefillFromBuilder()` in [public/script.js](public/script.js).

Keyboard: number keys answer, arrows move between options, `Backspace` goes
back. Answering moves focus to the new question, and a visually-hidden live
region announces only the parts that changed.

### Pricing

**All prices and fees live in [public/pricing.js](public/pricing.js) and are
placeholders until verified.** Nothing outside that file contains a dollar
figure. It holds four things:

| Key | What it is |
|---|---|
| `parts` | The catalog. Each entry has the label the site shows, a `[low, high]` price band, a `tier`, and any labor modifiers it triggers. |
| `platform` | Motherboard, PSU, fans, OS, cabling — nobody picks these in the quiz but they cost real money, sized to the build's highest-tier part. |
| `labor` | Flat build fee per track. Local AI scales with GPU tier, because that work is systems integration, not assembly. |
| `laborModifiers` | Custom loop, showpiece build, rack mounting. |

Components are quoted **at cost** — `PARTS_HANDLING` is `0`. The build fee is
therefore the only revenue on a build, and has to cover the free consult,
testing, warranty and RMA handling, and the occasional DOA rebuild. If you
ever want a handling percentage on parts, set that constant and disclose it;
the estimate math already routes through it.

There's deliberately **no budget question**. Asking for a budget up front
makes people guess a number before they know what they want, anchors them
low, and hides the options that would have taught them what things cost.
The estimate updates as they answer instead, so changing an answer visibly
moves the number.

Each track closes with a non-binding expectation check (`EXPECT` /
`expectationStep()` in [public/pc-builder.js](public/pc-builder.js)) that
reads the finished estimate back in the question itself — *"This build comes
to $3,650–$5,550. Does that land where you expected?"* It gates nothing and
changes no part. Its `close` text is shown back to the visitor on the
summary; its `lead` text rides along in the quote request, so a lead arrives
already labelled *ready to talk specifics* / *wants to find savings* /
*has room to go bigger*.

Estimates are **ranges, not point values** — a single number reads as a
quote. Totals round to the nearest $25 because the inputs aren't precise
enough to justify a figure that looks like it is. `AS_OF` is shown on the
summary so a stale estimate is visibly stale; update it when you refresh
prices.

The estimate the visitor was shown — plus the price date and a link back to
the exact config — is embedded in the message the quote CTA pre-fills, so a
request that arrives weeks later still shows what they were quoted.

When this moves to live vendor pricing, `parts` is the seam: each entry
grows a product id and `price` gets refreshed on a schedule. Nothing else
needs to change.

## Blog / case studies

Posts live as Markdown files in [content/posts/](content/posts/) with
front matter:

```md
---
title: Post title
date: 2026-05-12
tag: Case study — AI automation
excerpt: One-sentence summary shown on the blog index.
---

Body in Markdown...
```

Add a `.md` file, commit, push — it shows up at `/blog` and
`/blog/<filename-without-.md>` automatically. No build step, no CMS.

## Analytics

Every page load beacons `path` + `referrer` to `/api/track`, which writes a
row to the `pageviews` table in Turso — first-party, no cookies, no
third-party script. Query it directly via the Turso CLI or dashboard, e.g.:

```sql
SELECT path, COUNT(*) AS views FROM pageviews GROUP BY path ORDER BY views DESC;
```

## Search & link previews

Both `robots.txt` and `/sitemap.xml` are generated
([lib/seo.js](lib/seo.js)) rather than committed as static files — they change
shape with the pre-launch gate, and the sitemap reads `content/posts/` so
adding a post adds a sitemap entry with no separate step.

Static pages deliberately carry **no `lastmod`**. A date that moves on every
deploy teaches crawlers the field is noise, which costs more than the freshness
signal is worth. Blog posts get a real `lastmod` from their front-matter date.

Every page sets a canonical URL. That matters most on `/pc-builder`, where
every shared build is the same page with a different `#b=…` hash and tracks
arrive via `?track=`; without a canonical each variant looks like a separate
thin page.

`www.ahernai.com` 301s to the apex, so the apex is the canonical host. It's
configured in one place — `SITE_URL` in [lib/seo.js](lib/seo.js) — and
canonicals, `og:url`, and sitemap entries all build from it.

### The link preview card

`public/brand/og-image.png` is the 1200×630 image that shows up when the site
is pasted into a text, Slack, or Facebook. It's generated by
[scripts/make-og-image.js](scripts/make-og-image.js) and committed:

```bash
node scripts/make-og-image.js
```

It exists because `logo.png` can't be used directly. The logo is a transparent
PNG drawn for a dark page; link scrapers flatten transparency onto a background
of their own choosing — usually white — so the mark can come out nearly
invisible in exactly the moment it's supposed to make an impression. The script
bakes the dark brand background in so the card looks the same everywhere.

There's no image library involved on purpose: a native dependency shipped in
every deploy forever, to produce one static file that changes when the logo
does, is a bad trade. PNG is deflate plus per-scanline filters, and Node's
`zlib` already covers both directions. **Re-run it whenever the logo changes.**

## Deployment

Render Web Service, auto-deploy on push to `main`:
- Build command: `npm install`
- Start command: `node server.js`

Live at [ahernai.com](https://ahernai.com) (apex `A` → `216.24.57.1`,
`www` `CNAME` → `ahern-ai-solutions-web.onrender.com`, DNS at GoDaddy, TLS
issued by Render).

