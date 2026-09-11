# Satori in the Ahern AI portal

Imported all 59 repository files from `MikeDaddy84/satori`, commit
`3ea09a794bf751fdbf063928830830eb3afe909c`, on September 11, 2026,
including the original tests, migrations, lockfile, font and its license.
Git history was not imported. No existing agenda records or credentials were copied.

The website serves Satori inside its own workspace shell at `/portal/satori`.
There is no iframe, separate HTTP service, or external app link. The original
frontend is compiled with Vite and the original task/calendar/rollover services
run through `portal-worker.mjs`. The standalone server's password and session
code is retained as source but is not used or exposed by the portal.

Portal adaptations:

- Vite asset paths and CSS are scoped to the Satori surface.
- Frontend API requests use the portal session and CSRF token. Auth failure
  returns to `/login`; the old service worker is not registered inside the portal.
- History pagination now sends the parameter expected by the server.
- Calendar text is escaped before rendering into HTML.
- A separate preview adapter uses explicitly labeled sample data in tab storage;
  it never calls an agenda API. Calendar/history previews are empty, and rollover
  explains that a connected workspace is required.
- Build/test wrappers run on Windows as well as Linux.
- `portal-worker.mjs` validates payloads and serializes requests before invoking
  existing services. Per-workspace workers isolate calendar and rollover caches.
- All workspaces and portal accounts use Satori's existing Turso database.
  `lib/portal-schema.sql` adds five shared portal tables. Workspace keys on
  agenda rows constrain every select, update, delete, history upsert, and
  rollover operation. Keys come from the authenticated account's worker context;
  inserts receive that key through server-side Drizzle defaults. API callers
  cannot choose it. Composite keys allow users to have the same task/history IDs.
- The original schema remains active only for the standalone source/tests.
  Portal workers select the new schema, and their initialization never changes
  original `tasks`, `app_meta`, or `day_log`. Existing agenda records are not
  automatically copied into any portal account.

The first release retains Satori's America/Chicago agenda timezone and daily
rollover behavior. It does not add organization-wide task sharing,
an invitation UI, MFA, or self-service password reset. New accounts require no
new database; they use another workspace key in the existing database.
The portal is the authentication boundary; do not expose the imported standalone
Satori server alongside it.

To update from upstream, compare against the pinned commit and review these
adaptations before replacing source. Run the root integration tests and the
Satori regression suite after rebuilding.
