# Ahern AI — Website

Node/Express site for Ahern AI: AI automation, custom PCs, and
private local AI systems, based in Gordon, TX.

## Stack

- **Server:** Express (Node ≥18), serves the static homepage plus a
  Markdown-backed blog and two small JSON APIs.
- **Database:** [Turso](https://turso.tech) (libSQL) — contact form
  submissions and first-party pageview analytics.
- **Booking:** none — the contact form is the only inbound path.
- **Hosting:** Render (Web Service, free tier).

## Brand

The display brand is **Ahern AI**. The registered entity is still Ahern AI
Solutions, and that longer name stays on the copyright line in the footer and
anywhere else the legal name is what's wanted — display brand and legal entity
are allowed to differ.

### The lockup

The lockup is deliberately **two pieces, not one image**:

- **The mark** is `public/brand/mark.png` — the "A" cropped out of the original
  logo art with its transparency intact.
- **The wordmark** is live HTML text (`.logo-type`) set in Cabinet Grotesk 800,
  uppercase, tracked out to `.17em`.

Splitting them is what lets the lettering stay sharp at any size, read the
theme tokens directly instead of being inverted as a picture, and leaves the
bare mark available on its own for the favicon and social avatars. One custom
property, `--logo-size`, drives the whole lockup: it sets the mark's height and
everything else is expressed in `em`.

The wordmark carries a gradient that opens in the wordmark's own ink, warms
through brand blue across the middle of AHERN, and lands full orange on the I.
The stops sit on measured glyph boundaries rather than round numbers — AHERN
occupies 0–71.3% of the painted box and AI runs 77.9–100%, so the 52% blue stop
falls mid-R. Two details in [public/styles.css](public/styles.css) are load-
bearing and should not be "tidied up":

- The gradient is declared **twice**, plain sRGB first and `in oklab` second.
  Blue and orange blended in sRGB sag through a dead grey-brown at the midpoint,
  which is exactly where a full-width gradient puts its middle; oklab routes
  around it. A browser that can't parse `in oklab` drops that line and keeps the
  sRGB one.
- The whole gradient block sits behind `@supports (background-clip: text)`.
  Without both guards, an unsupported value leaves `background-image: none`
  behind `color: transparent` and the wordmark doesn't render at all.

`--logo-ink` is its own token because the gradient's first stop wants the navy
on light but the full text colour on dark; neither `--color-navy` nor
`--color-text` tracks both.

Colors come from the original logo art — navy `#3A4653→#202932`, blue
`#2CA0FF→#0072E8`, orange `#FF8A2E→#E85400` (dark-theme values; light theme uses
slightly deeper variants of the same three — see the `--color-navy` /
`--color-blue` / `--color-orange` tokens).

### Flat rasters

A gradient wordmark can't be a flat colour anywhere, so the lockup is also
committed as artwork for the places that need a single file — the social card,
print, a decal, an emailed invoice:

- `public/brand/lockup-light.png` — for light grounds.
- `public/brand/lockup-dark.png` — inverted mark plus light-on-dark wordmark.

Both are exported from the live lockup, so they carry the same mark art, the
same Cabinet Grotesk wordmark, and the same gradient (sampled in Oklab to match
what the CSS does). `public/brand/logo.png` is the **superseded** pre-rename
lockup, kept only for reference — it still reads "Ahern AI Solutions" and should
not be used on the site.

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
  the stylesheet, the mark, and the favicon stay open because the gate page
  itself renders with them. The gate builds the same split lockup as the rest of
  the site, but writes its CSS out longhand — it renders before any stylesheet
  of ours is guaranteed reachable, so it can't lean on the theme tokens.
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

## Websites & custom tools

The fourth offering, at `#web` on the homepage. It is deliberately **not** a
fourth service pillar: the three pillars stay three, and websites are a
footnote under them (`.pillars-aside`) plus a section of their own further down
the page. That's positioning, not layout convenience — this work is on the menu
because it pulls automation work behind it, not because it's something to chase.

Two things in that section are load-bearing and shouldn't be "corrected":

- **Website-only is priced *above* the bundle** — $9,500 minimum standalone
  against $6,500–9,500 for the same site with the intake automation wired in.
  That inversion is the whole mechanism. A site with no system behind it is
  work with no follow-on, so it's priced as a deterrent, and the copy says why
  in plain words rather than hiding it. Anyone who pays it has made it worth
  the week.
- **The rows are a list, not a card grid.** Four price cards in a row invite
  comparison, and in that format a standalone tier costing more than the bundle
  above it reads as a bug. As rows carrying their own reasoning, it reads as
  the deliberate filter it is.

The published floor ("Engagements start at $6,500") is the other half of the
filter. It belongs on the page, not behind a "contact for pricing" — the number
is what turns away the quick-brochure-site enquiries before they arrive, and
hiding it means having exactly the conversation it exists to avoid.

`.web-proof` is the portfolio for this pillar, and it's this site: Express,
first-party analytics, no CMS, the URL-encoded configurator, the token-driven
themes. The work was already done; it just wasn't labelled.

Pricing here is **not** in [public/pricing.js](public/pricing.js) — that file is
the PC Builder's cost model and nothing else. These figures are copy, and live
in the markup.

### The header nav holds six items

Six is the cap, verified against the layout: the header is logo + nav +
theme toggle + CTA inside a 1120px container, and a seventh item pushes the
whole page into a horizontal scroll before the nav drops out at 820px. Labels
also carry `white-space: nowrap`, because one item wrapping to two lines beside
single-line neighbours makes the whole bar look broken.

So the header carries Services / PC Builder / AI packages / Websites / Blog /
FAQ, and **the footer nav carries the full set** — "PC builds" (`#hardware`)
and "How it works" (`#process`) live there. Adding to the header means taking
something out of it.

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

It exists because the lockup can't be used directly. The lockup rasters are
transparent PNGs; link scrapers flatten transparency onto a background of their
own choosing — usually white — so the mark can come out nearly invisible in
exactly the moment it's supposed to make an impression. The script bakes the
dark brand background in so the card looks the same everywhere.

It builds from **`lockup-dark.png`**, not the light one. The card ground is
`#0a0d0c` and the script composites without recolouring, so a light-ground
lockup would put near-black line-work on a near-black card.

There's no image library involved on purpose: a native dependency shipped in
every deploy forever, to produce one static file that changes when the lockup
does, is a bad trade. PNG is deflate plus per-scanline filters, and Node's
`zlib` already covers both directions. **Re-run it whenever the lockup changes.**

## Deployment

Render Web Service, auto-deploy on push to `main`:
- Build command: `npm install`
- Start command: `node server.js`

Live at [ahernai.com](https://ahernai.com) (apex `A` → `216.24.57.1`,
`www` `CNAME` → `ahern-ai-solutions-web.onrender.com`, DNS at GoDaddy, TLS
issued by Render).

