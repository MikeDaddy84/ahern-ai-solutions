# Ahern AI Solutions — Website

Node/Express site for Ahern AI Solutions: AI automation, custom PCs, and
private local AI systems, based in Gordon, TX.

## Stack

- **Server:** Express (Node ≥18), serves the static homepage plus a
  Markdown-backed blog and two small JSON APIs.
- **Database:** [Turso](https://turso.tech) (libSQL) — contact form
  submissions and first-party pageview analytics.
- **Booking:** [Cal.com](https://cal.com) embed (popup widget).
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
| `PORT` | No | Render sets this automatically |

Schema (`contact_submissions`, `pageviews`) is created automatically on
first boot via `CREATE TABLE IF NOT EXISTS` — no manual migration needed
once the two env vars above are set. See [lib/db.js](lib/db.js).

## Booking (Cal.com)

The "Pick a time on the calendar instead" button and the embed script in
[public/index.html](public/index.html) currently point at the placeholder
`CAL_USERNAME/consultation`. To wire up real booking:

1. Create a free account at [cal.com](https://cal.com) and set up an event
   type (e.g. "consultation").
2. In `public/index.html`, replace both occurrences of
   `CAL_USERNAME/consultation` with your real `username/event-slug`.
3. Commit + push — Render auto-deploys.

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

## Deployment

Render Web Service, auto-deploy on push to `main`:
- Build command: `npm install`
- Start command: `node server.js`

