-- add_selected_sentence_positions_to_assignments.sql
-- Adds optional selection of dictation sentence positions for an assignment.
-- NULL means: all sentences are allowed/selected.

BEGIN;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS selected_sentence_positions int[];

COMMIT;
