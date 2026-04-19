BEGIN;

-- Convert history_activity.selected_sentence_positions from TEXT ('' or JSON like '[7,8]') to int[]
-- Empty/unknown selection becomes empty array '{}' to keep UNIQUE/UPSERT stable.

ALTER TABLE history_activity
DROP CONSTRAINT IF EXISTS uq_history_activity_user_dictation_date_sentences;

ALTER TABLE history_activity
ALTER COLUMN selected_sentence_positions DROP DEFAULT;

ALTER TABLE history_activity
ALTER COLUMN selected_sentence_positions TYPE int[]
USING (
    CASE
        WHEN selected_sentence_positions IS NULL THEN '{}'::int[]
        WHEN BTRIM(selected_sentence_positions) = '' THEN '{}'::int[]
        WHEN BTRIM(selected_sentence_positions) = '[]' THEN '{}'::int[]
        ELSE
            CASE
                WHEN NULLIF(
                    regexp_replace(BTRIM(selected_sentence_positions), '[^0-9,\-]+', '', 'g'),
                    ''
                ) IS NULL THEN '{}'::int[]
                ELSE string_to_array(
                    regexp_replace(BTRIM(selected_sentence_positions), '[^0-9,\-]+', '', 'g'),
                    ','
                )::int[]
            END
    END
);

-- Ensure stable key for ON CONFLICT and UNIQUE
ALTER TABLE history_activity
ALTER COLUMN selected_sentence_positions SET NOT NULL;

ALTER TABLE history_activity
ALTER COLUMN selected_sentence_positions SET DEFAULT '{}'::int[];

ALTER TABLE history_activity
ADD CONSTRAINT uq_history_activity_user_dictation_date_sentences
UNIQUE (user_id, dictation_id, date, selected_sentence_positions);

COMMIT;
