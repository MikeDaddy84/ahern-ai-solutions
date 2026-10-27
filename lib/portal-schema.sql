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
CREATE TABLE IF NOT EXISTS portal_account_setup (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES portal_users(id),
  expires_at INTEGER NOT NULL
);
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
-- Crew Room uses a separate append-only application record, scoped by authenticated workspace.
-- No existing Satori/portal records are migrated or rewritten.
CREATE TABLE IF NOT EXISTS portal_crew_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_key TEXT NOT NULL, created INTEGER NOT NULL,
  sender_id TEXT NOT NULL, display_name TEXT NOT NULL,
  recipient TEXT NOT NULL, thread TEXT NOT NULL, text TEXT NOT NULL,
  request_key TEXT NOT NULL,
  UNIQUE(workspace_key,sender_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_portal_crew_workspace ON portal_crew_messages(workspace_key,seq);
-- Call Desk (v1.1.0): sales call log, find-out questions and desk settings.
-- Additive only. Shared across the owner and employee accounts, not per workspace.
CREATE TABLE IF NOT EXISTS calldesk_calls (
  id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
  by_user TEXT NOT NULL REFERENCES portal_users(id),
  business TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', phone_norm TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '', seen TEXT NOT NULL DEFAULT 'none', seen_other TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', dm TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', best TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK(outcome IN ('booked','callback','sendinfo','voicemail','notinterested','nocontact','dnc')),
  consult_at TEXT NOT NULL DEFAULT '', consult_label TEXT NOT NULL DEFAULT '',
  confirmed INTEGER NOT NULL DEFAULT 0, confirmed_at INTEGER, notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_calldesk_calls_created ON calldesk_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_calldesk_calls_phone ON calldesk_calls(phone_norm);
CREATE TABLE IF NOT EXISTS calldesk_questions (
  id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, call_id TEXT REFERENCES calldesk_calls(id),
  asked_at INTEGER NOT NULL, due_by INTEGER NOT NULL, by_user TEXT NOT NULL REFERENCES portal_users(id),
  text TEXT NOT NULL, reach TEXT NOT NULL CHECK(reach IN ('call','email','text')), reach_to TEXT NOT NULL DEFAULT '',
  business TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('open','answered','relayed')), answer TEXT NOT NULL DEFAULT '',
  answered_at INTEGER, answered_by TEXT, relayed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_calldesk_questions_asked ON calldesk_questions(asked_at);
CREATE TABLE IF NOT EXISTS calldesk_config (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT
);
