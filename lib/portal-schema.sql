-- Additive portal schema in the EXISTING Satori Turso database.
-- No reads, alterations, or writes to legacy tasks/app_meta/day_log.
CREATE TABLE IF NOT EXISTS portal_users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, workspace_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member', disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS portal_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES portal_users(id),
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expiry ON portal_sessions(expires_at);
CREATE TABLE IF NOT EXISTS portal_satori_tasks (
  workspace_key TEXT NOT NULL, id TEXT NOT NULL, text TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('have_to','need_to','want_to')),
  status TEXT NOT NULL CHECK(status IN ('backlog','today','done','archived')),
  date_added INTEGER NOT NULL, date_done INTEGER, day_key TEXT, calendar_uid TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', PRIMARY KEY(workspace_key,id)
);
CREATE INDEX IF NOT EXISTS idx_portal_tasks_day ON portal_satori_tasks(workspace_key,day_key,sort_order,date_added);
CREATE INDEX IF NOT EXISTS idx_portal_tasks_status ON portal_satori_tasks(workspace_key,status,date_added);
CREATE TABLE IF NOT EXISTS portal_satori_meta (
  workspace_key TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY(workspace_key,key)
);
CREATE TABLE IF NOT EXISTS portal_satori_day_log (
  workspace_key TEXT NOT NULL, day_key TEXT NOT NULL,
  created_at INTEGER NOT NULL, summary_json TEXT NOT NULL,
  PRIMARY KEY(workspace_key,day_key)
);
CREATE INDEX IF NOT EXISTS idx_portal_history_created ON portal_satori_day_log(workspace_key,created_at);
