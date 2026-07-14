-- Harden password storage for new and upgraded passwords without rewriting
-- already-applied migrations. Existing rows remain verifiable as legacy HMAC
-- records and are upgraded after the next successful sign-in.
ALTER TABLE account_passwords ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'hmac-sha256';
ALTER TABLE account_pending_passwords ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'hmac-sha256';
ALTER TABLE account_password_history ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'hmac-sha256';

-- Verification codes are single-use, attempt-limited, and claimable with a
-- short lease so concurrent requests cannot both complete the same action.
ALTER TABLE account_verification_codes ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account_verification_codes ADD COLUMN processing_token TEXT;
ALTER TABLE account_verification_codes ADD COLUMN processing_started_at TEXT;

CREATE INDEX IF NOT EXISTS idx_account_verification_codes_processing
  ON account_verification_codes(user_id, purpose, used_at, processing_started_at);
