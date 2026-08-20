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

