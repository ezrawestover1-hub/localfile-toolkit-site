CREATE TABLE IF NOT EXISTS account_users (
  id TEXT PRIMARY KEY,
  normalized_email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_login_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_login_tokens_hash ON account_login_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_account_sessions_hash ON account_sessions(session_hash);
