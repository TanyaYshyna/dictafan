-- Миграция: добавление selected_sentence_positions в history_activity
-- Нужно для привязки активности к заданию (набору предложений) и отчета "План‑Факт"

BEGIN;

ALTER TABLE history_activity
ADD COLUMN IF NOT EXISTS selected_sentence_positions TEXT NOT NULL DEFAULT '';

-- Пересоздаем уникальность: теперь агрегация по (user_id, dictation_id, date, selected_sentence_positions)
ALTER TABLE history_activity
DROP CONSTRAINT IF EXISTS uq_history_activity_user_dictation_date;

ALTER TABLE history_activity
ADD CONSTRAINT uq_history_activity_user_dictation_date_sentences
UNIQUE (user_id, dictation_id, date, selected_sentence_positions);

COMMIT;
