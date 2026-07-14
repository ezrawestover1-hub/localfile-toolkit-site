ALTER TABLE paddle_events ADD COLUMN outcome TEXT;

ALTER TABLE entitlements ADD COLUMN paddle_item_id TEXT;
ALTER TABLE entitlements ADD COLUMN revoked_at TEXT;
ALTER TABLE entitlements ADD COLUMN revocation_reason TEXT;

ALTER TABLE activation_codes ADD COLUMN revoked_at TEXT;

CREATE TABLE IF NOT EXISTS entitlement_purchase_guards (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  entitlement_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(transaction_id, product_key, plan_key)
);

-- Seed the guard from existing active access without deleting or rewriting
-- historical entitlements. The partial unique index below prevents a second
-- active purchase while still allowing a repurchase after a confirmed refund.
INSERT OR IGNORE INTO entitlement_purchase_guards
  (id, customer_id, product_key, plan_key, transaction_id, entitlement_id, status, created_at, updated_at)
SELECT
  'guard_migration_' || substr(hex(randomblob(16)), 1, 24),
  customer_id,
  product_key,
  plan_key,
  transaction_id,
  id,
  'active',
  created_at,
  updated_at
FROM entitlements
WHERE status = 'active'
GROUP BY customer_id, product_key, plan_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_guards_active
  ON entitlement_purchase_guards(customer_id, product_key, plan_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_purchase_guards_transaction
  ON entitlement_purchase_guards(transaction_id, status);

CREATE TABLE IF NOT EXISTS paddle_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  action TEXT NOT NULL,
  adjustment_type TEXT,
  status TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'ignore',
  item_ids TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paddle_adjustments_transaction
  ON paddle_adjustments(transaction_id, effect, updated_at);
