-- Миграция: добавление языка диктанта в history_activity и history_successes
-- Нужна для быстрого фильтра по языку в отчетах без JOIN

BEGIN;

ALTER TABLE history_activity
ADD COLUMN IF NOT EXISTS dictation_language_code TEXT;

ALTER TABLE history_successes
ADD COLUMN IF NOT EXISTS dictation_language_code TEXT;

-- Backfill языка по существующим данным
UPDATE history_activity ha
SET dictation_language_code = d.language_code
FROM dictations d
WHERE ha.dictation_id = d.id
  AND (ha.dictation_language_code IS NULL OR ha.dictation_language_code = '');

UPDATE history_successes hs
SET dictation_language_code = d.language_code
FROM dictations d
WHERE hs.dictation_id = d.id
  AND (hs.dictation_language_code IS NULL OR hs.dictation_language_code = '');

CREATE INDEX IF NOT EXISTS idx_history_activity_lang_date ON history_activity(dictation_language_code, date);
CREATE INDEX IF NOT EXISTS idx_history_activity_user_lang_date ON history_activity(user_id, dictation_language_code, date);
CREATE INDEX IF NOT EXISTS idx_history_successes_lang_created_at ON history_successes(dictation_language_code, created_at);
CREATE INDEX IF NOT EXISTS idx_history_successes_user_lang_created_at ON history_successes(user_id, dictation_language_code, created_at);

COMMIT;
