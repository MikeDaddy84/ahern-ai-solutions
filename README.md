# Ahern AI — Website

Node/Express site for Ahern AI: AI automation, custom PCs,
private local AI systems, and websites and custom tools, based in Gordon, TX.

## Stack

- **Server:** Express (Node ≥20), serves the static homepage plus a
  Markdown-backed blog, inquiry delivery, and first-party activity APIs.
- **Database:** [Turso](https://turso.tech) (libSQL) — contact form
  submissions and first-party pageview analytics.
- **Booking:** none — the contact form is the only inbound path.
- **Hosting:** Render (Web Service, free tier).

## Login portal and embedded Satori — September 11, 2026

The website now includes `/login`, `/portal`, `/portal/settings`, and
`/portal/satori`. The website navigation links to sign-in. An explicitly labeled
sample workspace at `/portal/preview` lets Mike review the experience before
production accounts are configured. It uses no real agenda data.

All 59 source files from `MikeDaddy84/satori` at commit
`3ea09a794bf751fdbf063928830830eb3afe909c` are imported under `apps/satori`.
Satori is compiled and rendered inside the website's portal shell. It is not
an iframe, external link, or second HTTP service. Existing task, backlog,
calendar, history, and rollover behavior comes from that source. Adaptations
are listed in `apps/satori/PORTAL-INTEGRATION.md`.

### Account and workspace boundaries

All portal records use Satori's existing Turso database. The additive schema in
`lib/portal-schema.sql` creates `portal_users`, `portal_sessions`, `portal_account_setup`,
`portal_satori_tasks`, `portal_satori_meta`, and `portal_satori_day_log`.
Original `tasks`, `app_meta`, and `day_log` tables are not changed or copied.
Passwords use salted scrypt hashes; session tokens
are random and stored as SHA-256 hashes. Cookies are HttpOnly, SameSite=Strict,
and Secure in production. Sessions expire after 12 hours. Writes check both
origin and a session CSRF token. Sign-in attempts are limited in memory per
email and IP; this assumes the current single website process. Revisit rate
limiting before running multiple replicas.

Each account is bound to one unique workspace key. Every portal agenda query
includes that key, taken from the authenticated account. Inserts use a
server-side default, and task/history/meta keys include workspace ownership.
This applies to direct task changes, history, rollover, backlog pulls,
calendar deduplication, and retention cleanup. Requests cannot select a different
workspace. New accounts require no new database or database configuration.
A worker thread loads Satori services for each active workspace to isolate
calendar and rollover caches. Workers never listen on a port. Requests are
serialized per workspace. Four workers may be active; idle ones are recycled
and stop after five minutes. Revisit memory, durable rate limiting, and
scheduling before scaling beyond a small rollout.

Roles (`owner`, `employee`, `client`, `member`) currently label accounts. They
do not grant access to another person's agenda or to `/leads`. There is no
organization sharing, admin impersonation, invitation UI, MFA, automated
password-reset email, or automatic client provisioning yet. The
operator CLI creates accounts and resets passwords, revoking their sessions.
Changing a user's workspace moves their access; it does not migrate their data.

### Build and verify

Run `npm ci`, `npm run build`, `npm test`, and `npm test --prefix apps/satori`.
The root install also installs Satori's pinned dependencies. The root build
compiles Satori and validates the existing Express site. `npm start` serves
everything from the existing website process. `npm run test:tz-chicago --prefix
apps/satori` checks Satori's DST fixtures in Central Time.

Without configured account storage, login reports unavailable and the preview
still works after a build. Preview task changes are tab-local sample state;
preview history/calendar are empty and daily rollover requires a real workspace.

### Enable on the existing Render service

1. Use build command `npm ci && npm run build`, start command `npm start`,
   `NODE_ENV=production`, and `SITE_URL=https://ahernai.com`.
2. Reuse the **existing Satori database**. Set `SATORI_DATABASE_URL` and
   `SATORI_AUTH_TOKEN` privately on the website service using the values from
   Satori's `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The website's own
   contact/analytics connection is independent and is not a fallback.
   Run `npm run portal:db` to apply and verify the additive six-table schema;
   runtime initialization also applies it idempotently. No new database is needed.
3. Optionally configure `SATORI_WORKSPACE_CALENDARS_JSON` as an object keyed
   by workspace names, with `calendarUrl` / `familyCalendarUrl` per key.
   These are server-only HTTPS feeds. A user without configured feeds does not
   inherit another user's calendars. Per-user database settings are not used.
4. For a new account, set `PORTAL_USER_EMAIL`, `PORTAL_USER_NAME`,
   `PORTAL_USER_WORKSPACE`, and `PORTAL_USER_ROLE` in the private hosting shell,
   then run `npm run portal:setup`. Deliver the returned setup URL privately to
   that account holder. It expires in 24 hours and can be consumed once. The
   account remains disabled until the holder sets a password. Only a hash of
   the setup token is stored; the URL fragment is removed by the setup page.
   Existing accounts cannot be overwritten by this command.
   Alternatively, for operator password resets, set
   `PORTAL_USER_EMAIL`, `PORTAL_USER_NAME`, `PORTAL_USER_PASSWORD` (14–256
   characters), `PORTAL_USER_WORKSPACE`, and `PORTAL_USER_ROLE`, then run
   `npm run portal:user`. Remove the password variable afterward. Never pass
   passwords on the command line or place credentials in committed files.
5. Deploy through the existing Render/GitHub workflow and verify sign-in,
   persistence, and sign-out. New portal accounts start with empty agendas.
   Existing standalone Satori records stay in the original tables. Copying
   Mike's existing records into his portal workspace is a separate explicit
   data migration, not something account creation does automatically.

The existing pre-launch gate still applies before portal login. Remove it only
when the public website is ready. Render sleeping may delay the first request;
check the chosen plan's memory against simultaneous Satori workers before an
employee/client rollout. This Node/Express implementation uses worker threads
and is not a Cloudflare Workers / Sites deployment bundle. Hosting is retained
on Render rather than replacing the site's architecture.

For account removal, revoke sessions and disable/delete the account, then
delete that workspace's rows from all three portal Satori tables as requested.
Do not drop the shared database or delete other workspaces or legacy records.
Deleting an account row alone does not delete its workspace records.

## Service growth implementation — September 2026

All four services have equal homepage entry points. Existing pricing anchors,
the PC configurator, and Express/Render/Turso hosting are retained.

- Automation adds scoped Quickstart examples and a capacity-value calculator.
  The calculator subtracts review time and ongoing costs, including optional
  support when entered. It estimates capacity value, not guaranteed cash savings.
- PCs add workload rationale to the final estimate and offer separately quoted
  migration, setup, testing/handoff, and care. Everyday builds keep their own
  inquiry category. No benchmark results or new warranty terms are invented.
- Private AI adds a use-case fit planner, an explicitly preset document-answer
  demonstration, and a paid-pilot → deployment → optional care path. Pilot and
  care pricing require individual quotes.
- Websites add an intake planner and a fictional four-step inquiry demo.
  Standalone website scope remains available. New integrations and improvement
  projects are separate from care.
- `/resources` offers four ungated, printable project checklists. Service-page
  shortcuts make these and the planners accessible without scrolling the page.
- Planner handoffs use tab session storage, expire for form use after 24 hours,
  and appear as editable notes only on the matching service inquiry. No planner
  answers are sent until the visitor submits the form. Optional budget, timing,
  and service-specific context are appended to the stored inquiry and email.
- `/leads` adds stages, sale amounts, direct costs, hours, and outcome notes.
  Saving uses the existing separate Basic credentials and an inquiry-bound
  anti-forgery token. Reload after a process restart to refresh tokens. Totals
  are sale less direct costs, **before labor, overhead, and tax**; unknown values
  stay blank. This is an inquiry tracker, not accounting software.
- `/api/events` accepts only known events and service categories. Stored events
  have no contact fields, answers, visitor identifiers, or query strings. The
  dashboard shows 30-day counts, not unique people or attributed conversions.
  Client blocking and retries affect counts; saved leads are the sales record.

Additive `lead_pipeline` and `site_events` tables initialize automatically.
Existing inquiries appear at stage `new` and gain a pipeline record when edited;
they are never resent by this migration. Include `lead_pipeline` when removing
an inquiry for a deletion request. Activity reporting can be cleared separately.

### Scope and delivery capacity

New monthly automation support scopes name covered workflows and include up to
two hours of support/improvements, with no rollover and additional work quoted.
Website care includes the agreed first year in the project price: $249 allows
30 minutes of minor changes monthly; $399 allows one hour including content
edits. Maintenance, backup coverage, service hours, and extra work belong in the
written scope. Existing signed agreements retain their terms. Budget the first
year's hosting and service obligations in every website quote.

These limits and the individually quoted PC/private-AI add-ons need to be
reflected in each proposal. The older investor model in
`scripts/unit-economics.js` still uses historical assumptions (including 1.5
retainer hours) and does not reserve a website's included care year; it is not a
quote calculator or evidence of the new offers' margins. Use actual delivery
hours and direct costs from the dashboard to revise the business model.

Validation: `npm test` covers planner mathematics, carry-forward boundaries,
inquiry persistence/retries, authenticated status changes, migration, event
storage, service links, and the existing builder/demo flows. Tests use local
databases and mocked email; they do not send production notifications.

## Build studio and inquiry delivery — September 2026 update

The existing Express/Render architecture is retained. Run `npm ci`,
`npm test`, and `npm run build`; start with `npm start`. Node 20 or newer is
required. There is no bundler: the build command validates the server/browser
source and the self-hosted Three.js assets.

- `/pc-builder` now has a procedural 3D showroom: representative RTX-style
  graphics cards, motherboard, individually animated DIMMs, case, storage,
  air/AIO/custom-loop cooling, and sealed appliances. Exact manufacturer CAD
  and final compatibility are not implied. Brand/model selection stays in the
  final quote. Models are in `public/builder-models.mjs`; animation, lighting,
  soft shadows, bloom, rotation and motion preferences are in
  `public/builder-scene.mjs`. Libraries are served locally, never from a CDN.
- Editing an earlier compatible answer preserves the rest of the machine.
  Changing the purpose or AI delivery fork resets incompatible answers.
  An edited completed build asks the visitor to confirm the revised estimate.
- URLs now include `#v=1&b=…`; unversioned links still work. Future question
  schema changes must retain a v1 decoder, or explicitly reject old versions.
  Comparisons retain an estimate snapshot in tab session storage; opening
  a saved link uses the current price catalog.
- Dedicated service pages live at `/services/automation`,
  `/services/custom-pcs`, and `/services/local-ai`. The automation walkthrough
  uses clearly labeled preset data and makes no external calls or claims of
  actual client results.
- New contact submissions and email jobs commit in one transaction.
  Request IDs make retries idempotent. Failed writes return 503 and leave
  the form intact. Notification failures remain queued with exponential
  retries, capped at one hour. The worker runs once a minute while the service
  is awake, on startup, and after a successful form submission. A sleeping
  free Render service delays queued retries until it wakes.
- Email delivery is disabled until `LEAD_NOTIFY_TO`, `LEAD_NOTIFY_FROM`, and
  either `RESEND_API_KEY` or SMTP credentials are configured privately.
  Resend uses HTTPS. SMTP requires a host/plan that permits outbound SMTP.
  Sender addresses must be authorized with the provider. SMTP delivery is
  at least once: a crash after provider acceptance can produce a duplicate.
  No production email was sent as part of the automated tests.
- `/leads` shows the latest 100 inquiries, including older records, and their
  notification status. It is disabled until `LEADS_DASHBOARD_PASSWORD` is at
  least 16 characters. Username: `mike`. Use a separate strong password and
  HTTPS in production; do not reuse the pre-launch gate credential. The inbox
  has no tracking, external fonts, or public navigation link.

See `.env.example` for configuration names. Real credentials belong in Render,
never in Git. The additive `contact_receipts` and `lead_notifications` tables
are created on startup; existing contacts are retained and are not retroactively
emailed. For a deletion request, remove the associated notification and receipt
rows as well as the contact and any email copies.

### Inquiry email setup

Google Workspace hosts `mike@ahernai.com`; `hello@ahernai.com` is its public
contact alias. Send website notifications to Mike once, without copying the alias.
The customer address is the notification's Reply-To, so Reply opens a response to
the customer while the sender stays on the verified Ahern AI domain.

The existing Resend HTTPS integration works with Render's free service, which
[blocks outbound SMTP ports 25, 465, and 587](https://render.com/docs/free#other-limitations).
To enable it:

1. Verify `ahernai.com` in Resend using the exact sending DNS records it provides.
   Keep Google Workspace's existing mail-receiving MX records. Do not enable
   Resend inbound receiving or replace the Workspace records.
2. Create a Resend sending API key scoped to the verified domain. In the Render
   service's Environment settings, set `RESEND_API_KEY` privately,
   `LEAD_NOTIFY_TO` to `mike@ahernai.com`, and `LEAD_NOTIFY_FROM` to
   `Ahern AI <hello@ahernai.com>` (without surrounding quotes in the Render UI).
3. Optionally set a unique `LEADS_DASHBOARD_PASSWORD` of at least 16 characters
   to enable `https://ahernai.com/leads`; username is `mike`.
4. Save and deploy. Submit one clearly labeled test inquiry, confirm it arrives
   in Mike's inbox, and verify Reply addresses the test customer. Provider
   acceptance alone does not prove inbox delivery. This test sends an actual
   email and should be done only during the authorized setup.

Pending notifications accumulated since the outbox was introduced will also
send when delivery is enabled. Older legacy contacts without outbox entries
are not emailed. `.env.example` documents the addresses; changing it does not
configure the production service. No mailbox password is needed for Resend.

## Audience paths — September 2026

The homepage is the starting point for three audiences: business automation
buyers, gamers and creators, and private-AI customers. Its hero links directly
to each service; detailed pricing and demos live on their relevant pages.

- `/services/automation`: workflow examples, the interactive sample walkthrough,
  all automation packages, and business-specific FAQs.
- `/services/custom-pcs`: gaming, creative and everyday builds, the live estimate
  demo, pricing explanation, and links into the appropriate builder track.
- `/services/local-ai`: use cases, data boundaries, hardware tradeoffs, ongoing
  costs, and a consultation or AI hardware exploration.
- `/services/websites`: website and custom-tool scopes, full existing pricing,
  care plans, and a focused consultation link.

The homepage retains the founder introduction, process, general questions, and
contact form. Service consultation links preselect the matching contact interest.
Old homepage hashes for pricing, hardware, websites, and the automation demo
forward to their new destinations while retaining query parameters. Pricing,
hardware, and website anchors also retain a homepage service link without JS.

Full pricing is unchanged. The relocated markup lives in
`content/services/*.html`, loaded by `lib/services.js`. The sitemap includes all
four service pages, each with its own title, description, and canonical URL.
The existing Express/Render hosting is retained.

## Brand

### Homepage credibility

The `#meet-mike` introduction sits directly after the hero and draws from the
About page: twelve years in technical work, VoIP engineering at NextLink, and
Mike's progression to KCS VP/CTO in 2022. Keep these details aligned with
`lib/pages.js`; they describe Mike's career, not Ahern AI client results.

`#work-samples` links to the working PC builder and separately labels the two
reference projects as proposed approaches rather than completed customer work.
The builder's 3D model is described as an illustration, not a build photograph.

Mike supplied photos in `public/photos/`. The homepage uses three unchanged
copies with descriptive filenames: `mike-ahern.jpg` (black-and-white office
portrait), `white-pc.jpg` (white tower), and `desktop-setup.jpg` (dual-monitor
setup). Their source filenames are respectively `WhatsApp Image 2023-12-06 at
15.01.03_90a4556b.jpg`, `WhatsApp Image 2026-09-10 at 10.34.41 AM.jpeg`, and
`WhatsApp Image 2026-09-10 at 10.25.11 AM.jpeg`.

Images have intrinsic dimensions, descriptive alt text, and lazy loading.
Captions describe visible hardware without asserting customer engagements or
results. Unselected originals stay in the local drop folder and are ignored by
Git; only the three selected copies are included in a repository deployment.
No stock portrait or generated build photo is used.

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

## The service-page build demo

The live estimate terminal now lives on `/services/custom-pcs`, below the build
options. The homepage hero instead offers the three audience paths. The demo
still reads the shared `public/pricing.js` model and hands the selected track
to the full builder. Its markup is in `content/services/builderDemo.html`.

The page loads the pricing model before `public/script.js`. Its
`data-default-track="gaming"` selects the initial estimate; buttons still link
to the builder if the pricing model is unavailable. Estimates remain labeled
as typical builds, and the output is a polite live region.

## PC Builder sandbox

### Final-step startup preview

The final expectation question now powers on the 3D preview. A case/appliance
indicator fades on first; visible fan rotors accelerate and settle, and selected
ARGB fades in. Other cases retain ordinary unlit fans. Sealed appliances show
their status indicator without invented external fans or rainbow lighting.

`public/pc-builder.js` emits a presentation `phase` (`configuring`, `expectation`,
or `summary`) with each `ahern:build-change`. The scene starts only when the
estimate is complete and the visitor is reviewing the estimate or summary.
Answering that question does not replay startup. Editing an earlier answer
returns the preview to idle; returning to review powers it on again. Saved
complete builds also start up after the hardware finishes assembling.

Timing and lighting behavior are in `public/builder-power.mjs`, separately from
prices and answers. Startup takes about 2.8 seconds after assembly, advances
only while the preview is visible, and never delays the question or quote CTA.
The motion toggle and reduced-motion preference show a static powered state
immediately. No audio is used. The camera gently settles into the assembled view
on startup; rotation and other view controls remain available.

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
  "Start this build" links on the custom PC service page) and is rewritten to a `#b=` hash
  on load.
- The CTA hands off to the homepage contact form via `?interest=&build=`,
  read by `prefillFromBuilder()` in [public/script.js](public/script.js).

Keyboard: number keys answer, arrows move between options, `Backspace` goes
back. Answering moves focus to the new question, and a visually-hidden live
region announces only the parts that changed.

### Pricing

**All prices and fees live in [public/pricing.js](public/pricing.js), verified
September 2026 against US street pricing** — Amazon/Newegg lowest current
listings, not MSRP. MSRP is meaningless in this market: the RTX 5090 carries a
$1,999 sticker and sells around $4,500.

**Re-check this file quarterly.** Components are moving 10–15% a quarter and
the catalog went badly stale once already — it sat on RTX 40-series parts and
pre-shortage memory prices while a 64GB DDR5 kit went from ~$190 to ~$900,
which meant the builder was quoting some machines below what their parts cost.
Update `AS_OF` whenever you touch the numbers, so a stale estimate is visibly
stale on the summary.

The catalog holds four things:

| Key | What it is |
|---|---|
| `parts` | The catalog. Each entry has the label the site shows, a `[low, high]` price band, a `tier`, and any labor modifiers it triggers. |
| `platform` | Motherboard, PSU, fans, OS, cabling — nobody picks these in the quiz but they cost real money, sized to the build's highest-tier part. |
| `labor` | Flat build fee per track. Local AI scales with GPU tier, because that work is systems integration, not assembly. |
| `laborModifiers` | Custom loop, showpiece build, rack mounting. |

Hardware is quoted at cost **plus 10% handling** (`PARTS_HANDLING`), shown
as its own line on the summary rather than folded into the parts figure — a
disclosed percentage is defensible, the same money hidden inside a component
total is what people feel cheated by later. It isn't margin for its own sake:
prices move between quoting and buying, and without it every one of those
moves comes out of the build fee. Quoting at bare cost in this market isn't
generous, it's uninsured.

**Handling applies to the platform too, not just the parts picked in the
quiz.** It didn't until September 2026, and that was a straight bug: the
platform is $330–$4,000 of board, PSU, OS and cabling bought at cost in the
same market, on the same curve, and exempting it meant the build fee quietly
absorbed every price move on that share of the hardware — $25–$100 a build,
more on a workstation. An appliance has no platform line, so appliance totals
were never affected and did not change.

Because of that, the summary prints the platform **above** the handling line.
Someone checking 10% against the line above it has to land on the number
shown; a disclosed fee that doesn't reconcile is worse than one that was
never broken out. If you reorder those rows, the arithmetic stops being
checkable from the page.

Changing `PARTS_HANDLING` updates the estimate, the summary breakdown, the
copied spec text and the pre-filled quote message automatically — they all
read it through `PRICING.handlingPct`. **The two prose mentions in
[public/pc-builder.html](public/pc-builder.html) are hand-written and won't
follow**; change those by hand or the page will contradict the estimate.

`VALID_DAYS` (7) drives the "good for 7 days" line. It caps the exposure on a
quote someone sits on for a month, and said out loud it reads as competence
rather than hedging.

The build fee still carries the free consult, testing, warranty and RMA
handling, and the occasional DOA rebuild. Fees were left unchanged in the
September 2026 repricing — the work didn't get harder, and the handling
percentage is what addresses the margin problem.

### AI appliances, and the one forking track

The AI track asks **how do you want it delivered** before anything else, and
the answer changes every question after it. A workstation gets the original
five (model size, daily use, storage, location, cooling); an appliance gets
three (model size, priority, storage), because a sealed box has no cooling or
case to choose.

That fork is why `TRACKS[x].steps` may be **either an array or a function of
the build so far**, resolved through `stepsFor()`. Both `recompute()` and
`decodeAnswers()` replay answers through it rather than reading a fixed list,
so an index in the URL hash is always validated against the questions that
were actually on screen at that point. `slotsFor()` does the same job for the
spec panel — an appliance fills two slots (`appliance`, `storage`) instead of
six.

Appliances live in `appliances`, not `parts`, and `estimate()` routes them
through `estimateAppliance()`. They replace the CPU, GPU, memory **and**
platform in one SKU, so they skip the platform table entirely — putting one in
the GPU slot would have double-counted the rest of the machine. `est.platform`
is therefore `null` on an appliance and every consumer has to tolerate that.

They earn their place on the maths: a 70B model needs ~40–70GB to load, which
is two RTX 5090s and about $9,000 of GPU in a workstation, or 128GB of unified
memory in a $2,300 Strix Halo box. The appliance is much slower per token —
bandwidth is what it trades away, not capacity — so the second question is
explicitly about that trade, and picking "fastest answers" swaps the NVIDIA and
AMD boxes for the higher-bandwidth Mac Studio equivalents with a note that it
isn't CUDA.

Labor for an appliance is `labor.appliance` ($650), lower than a build fee
because there is no assembly — but the work that actually matters on a local
AI system is unchanged: quantization, the inference server, integration, and
proving it holds up under load.

> **Adding the fork shifted every AI answer index by one.** A pre-existing
> `#b=ai.…` link now decodes to different answers. Nothing was live behind the
> gate when this changed, so no real share links broke — but if you ever
> insert a step ahead of others again, that is the cost.

Part keys are named for the **job the part does** (`game4k`, `aiFlagship`,
`creatorVideo`), never for the silicon in it. The original catalog used model
names (`rtx4070ti`, `ai4090`), which meant every key had to be renamed and
every reference in `pc-builder.js` chased down the moment the 40-series aged
out. Labels carry the model number; keys don't.

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

The fourth offering, at `/services/websites`. It is deliberately **not** a
fourth service pillar: the three pillars stay three, and websites are a
footnote under them (`.pillars-aside`) linking to their dedicated page. That's positioning, not layout convenience — this work is on the menu
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

So the header carries Automation / Custom PCs / Private AI / Websites /
PC Builder / Blog, and **the footer nav carries the full set**, including
automation pricing, How it works, FAQ, About, and contact. Adding to the header means taking
something out of it.

## Blog / reference builds

Posts live as Markdown files in [content/posts/](content/posts/) with
front matter:

```md
---
title: Post title
date: 2026-05-12
tag: Reference build — AI automation
excerpt: One-sentence summary shown on the blog index.
---

Body in Markdown...
```

Add a `.md` file, commit, push — it shows up at `/blog` and
`/blog/<filename-without-.md>` automatically. No build step, no CMS.

**These are reference builds, not case studies, and the difference is not
cosmetic.** They were originally written as case studies — first person
plural, a named client type, results attached — before there was a first
customer. Published, that is a claim about work that did not happen. They
now describe how a problem gets solved, priced from real components, and
each one closes by saying what it is.

Keep it that way. A post may become a genuine case study **only** when there
is a real engagement behind it and the client has agreed to be named. Until
then the tag stays `Reference build`, results stay design targets rather
than achievements, and the voice stays first person **singular** — the rest
of the site says "I", and "we" implies a team that does not exist.

Post dates are date-only strings. `server.js` formats them with
`timeZone: 'UTC'` (`POST_DATE_FORMAT`); without it `new Date('2026-06-30')`
is UTC midnight, renders as the 29th in any US timezone, and disagrees with
both the `<time datetime>` attribute and the sitemap's `lastmod`.

## About and Privacy

[lib/pages.js](lib/pages.js) holds the markup for `/about` and `/privacy`,
rendered through `renderPage()` like the blog rather than living as static
files in `public/` — they need the same chrome, canonical and OG tags, and
a third and fourth hand-written copy of the header and footer is how those
copies start disagreeing.

**The privacy page is specific, not boilerplate, and that makes it a
maintenance obligation.** It names the exact columns [lib/db.js](lib/db.js)
writes, states that no cookies are set, that no IP address is stored, and
that Fontshare is the only third party the browser contacts. Every one of
those is checkable against the code, which is the point — a generic policy
mentioning advertising partners this site does not have would be worse than
none, because the honest version is a selling point.

If you add a tracker, an embed, a chat widget, or a column to either table,
that page is now false. Update it in the same commit.

## Structured data

One `ProfessionalService` node, inline in [public/index.html](public/index.html),
plus `BlogPosting` on each post from `seo.blogPostingSchema()`. The business
node lives on the home page rather than in `renderPage()` on purpose:
crawlers expect a single such node at the root, and emitting a copy on every
rendered page is how two copies drift apart.

Everything asserted in it appears in visible copy somewhere on the site. Do
not add `aggregateRating`, `review`, `openingHours`, `geo` or `priceRange`
without a real source — invented structured data is a manual-action risk,
and a fabricated review rating is the fastest way to lose the rich result
entirely.

Server-rendered JSON-LD goes through `jsonLdText()` in
[lib/layout.js](lib/layout.js), which escapes `<`, `>` and `&` to their JSON
unicode forms. Without it a post title containing `</script` would close the
element early and break the page open — the HTML parser does not care that
the sequence is inside a JSON string.

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
- Build command: `npm ci --include=dev && npm run build`
- Pre-deploy command: `npm run portal:db`
- Start command: `node server.js`

Live at [ahernai.com](https://ahernai.com) (apex `A` → `216.24.57.1`,
`www` `CNAME` → `ahern-ai-solutions-web.onrender.com`, DNS at GoDaddy, TLS
issued by Render).

