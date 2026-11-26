-- Email verification on registration
-- Code is sent to the user's email; valid for 300 seconds (5 minutes).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(16),
    ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_verification_last_request_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_code
    ON users (email_verification_code);
