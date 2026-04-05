BEGIN;

ALTER TABLE history_successes
ADD COLUMN IF NOT EXISTS source_group_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_history_successes_source_group_id ON history_successes(source_group_id);

COMMIT;
