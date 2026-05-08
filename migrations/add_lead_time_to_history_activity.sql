BEGIN;

ALTER TABLE history_activity
ADD COLUMN IF NOT EXISTS lead_time BIGINT NOT NULL DEFAULT 0;

-- Backfill: approximate lead_time for existing history so that old data is not 0.
-- perfect: 20s, corrected: 30s, audio: 10s
UPDATE history_activity
SET lead_time = (
    COALESCE(perfect_count, 0) * 20000
    + COALESCE(corrected_count, 0) * 30000
    + COALESCE(audio_count, 0) * 10000
)
WHERE COALESCE(lead_time, 0) = 0;

COMMIT;
