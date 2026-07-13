CREATE TABLE IF NOT EXISTS account_pending_passwords (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_password_history_user
  ON account_password_history(user_id, created_at DESC);
