BEGIN;

ALTER TABLE history_successes
  ADD COLUMN IF NOT EXISTS selected_sentence_positions int[];

COMMIT;
