CREATE TABLE IF NOT EXISTS paddle_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT,
  processed_at TEXT NOT NULL,
  transaction_id TEXT,
  payload_hash TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  paddle_customer_id TEXT UNIQUE,
  normalized_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(transaction_id, product_key, plan_key)
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL,
  code_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT,
  redeemed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL,
  installation_id_hash TEXT NOT NULL,
  token_id TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(entitlement_id, installation_id_hash)
);

-- Restore requests intentionally contain no activation code. A transactional
-- email provider can consume this record and deliver a newly generated code.
CREATE TABLE IF NOT EXISTS restore_requests (
  id TEXT PRIMARY KEY,
  normalized_email TEXT NOT NULL,
  matched_entitlements INTEGER NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
