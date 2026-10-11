CREATE TABLE IF NOT EXISTS account_sync (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_ms INTEGER NOT NULL,
  modified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_sessions (
  token_hash TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_sessions_google_sub_idx ON sync_sessions (google_sub);
CREATE INDEX IF NOT EXISTS sync_sessions_expires_at_idx ON sync_sessions (expires_at);
