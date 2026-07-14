ALTER TABLE paddle_events ADD COLUMN status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE paddle_events ADD COLUMN processing_token TEXT;
ALTER TABLE paddle_events ADD COLUMN processing_started_at TEXT;
ALTER TABLE paddle_events ADD COLUMN last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_codes_entitlement
  ON activation_codes(entitlement_id);

CREATE INDEX IF NOT EXISTS idx_paddle_events_status
  ON paddle_events(status, processing_started_at);
