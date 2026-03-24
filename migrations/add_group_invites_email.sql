-- Add support for email-based group invites

ALTER TABLE group_invites
    ADD COLUMN IF NOT EXISTS target_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS accepted_by_student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_group_invites_target_email_lower ON group_invites (LOWER(target_email));
