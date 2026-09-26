-- Добавление нидерландского языка (nl) в языки и флаги перевода dictations и users
BEGIN;

-- Регистрируем язык в таблице languages (без запуска seed_languages.py)
INSERT INTO languages (code, code_url, name_native, name_en, is_active)
VALUES ('nl', 'nl-NL', 'Нидерландский', 'Dutch', TRUE)
ON CONFLICT (code) DO UPDATE
SET code_url = EXCLUDED.code_url,
    name_native = EXCLUDED.name_native,
    name_en = EXCLUDED.name_en,
    is_active = EXCLUDED.is_active;

-- dictations.tr_nl — признак наличия перевода на нидерландский
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_nl BOOLEAN;

-- Заполняем tr_nl для существующих записей (перевод есть, если в предложениях
-- есть строки на нидерландском, а язык оригинала отличается от nl)
UPDATE dictations d
SET tr_nl = EXISTS (
    SELECT 1
    FROM dictation_sentences s
    WHERE s.dictation_id = d.id
      AND s.language_code = 'nl'
      AND COALESCE(d.language_code, '') <> 'nl'
)
WHERE tr_nl IS NULL;

-- Индекс для быстрой фильтрации по переводу на нидерландский
CREATE INDEX IF NOT EXISTS idx_dictations_tr_nl_true ON dictations (id) WHERE tr_nl IS TRUE;

-- users.tr_nl — признак изучения нидерландского языка пользователем
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_nl BOOLEAN NOT NULL DEFAULT FALSE;

-- Заполняем tr_nl для существующих пользователей на основе current_learning
UPDATE users
SET tr_nl = (COALESCE(current_learning, '') = 'nl')
WHERE tr_nl IS FALSE;

COMMIT;
