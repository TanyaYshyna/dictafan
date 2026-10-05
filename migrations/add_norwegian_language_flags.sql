-- Добавление норвежского языка (no) в языки и флаги перевода dictations и users
BEGIN;

-- Регистрируем язык в таблице languages (без запуска seed_languages.py)
INSERT INTO languages (code, code_url, name_native, name_en, is_active)
VALUES ('no', 'no-NO', 'Норвежский', 'Norwegian', TRUE)
ON CONFLICT (code) DO UPDATE
SET code_url = EXCLUDED.code_url,
    name_native = EXCLUDED.name_native,
    name_en = EXCLUDED.name_en,
    is_active = EXCLUDED.is_active;

-- dictations.tr_no — признак наличия перевода на норвежский
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_no BOOLEAN;

-- Заполняем tr_no для существующих записей (перевод есть, если в предложениях
-- есть строки на норвежском, а язык оригинала отличается от no)
UPDATE dictations d
SET tr_no = EXISTS (
    SELECT 1
    FROM dictation_sentences s
    WHERE s.dictation_id = d.id
      AND s.language_code = 'no'
      AND COALESCE(d.language_code, '') <> 'no'
)
WHERE tr_no IS NULL;

-- Индекс для быстрой фильтрации по переводу на норвежский
CREATE INDEX IF NOT EXISTS idx_dictations_tr_no_true ON dictations (id) WHERE tr_no IS TRUE;

-- users.tr_no — признак изучения норвежского языка пользователем
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_no BOOLEAN NOT NULL DEFAULT FALSE;

-- Заполняем tr_no для существующих пользователей на основе current_learning
UPDATE users
SET tr_no = (COALESCE(current_learning, '') = 'no')
WHERE tr_no IS FALSE;

COMMIT;
