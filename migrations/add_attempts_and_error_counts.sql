BEGIN;

DO $$
BEGIN
    IF to_regclass('public.history_unclosed_dictations_sentences') IS NOT NULL THEN
        ALTER TABLE history_unclosed_dictations_sentences
            ADD COLUMN IF NOT EXISTS attempts_total INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE history_unclosed_dictations_sentences
            ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;
    END IF;
END$$;

ALTER TABLE history_successes
    ADD COLUMN IF NOT EXISTS attempts_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE history_successes
    ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;

COMMIT;
