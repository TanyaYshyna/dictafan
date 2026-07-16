-- Миграция: гарантированно добавляет все колонки, необходимые для работы /desk/api/items
-- Выполняется идемпотентно (IF NOT EXISTS / IF NOT IN)

BEGIN;

-- ============================================================
-- 1. Колонки tr_* (флаги перевода)
-- ============================================================
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_en BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_uk BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_sv BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_be BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_ru BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_de BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_fr BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_es BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_it BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_tr BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_ar BOOLEAN;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS tr_pl BOOLEAN;

-- Заполняем tr_* для записей, где они NULL
UPDATE dictations d
SET
  tr_en = COALESCE(tr_en, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'en' AND COALESCE(d.language_code, '') <> 'en')),
  tr_uk = COALESCE(tr_uk, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'uk' AND COALESCE(d.language_code, '') <> 'uk')),
  tr_sv = COALESCE(tr_sv, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'sv' AND COALESCE(d.language_code, '') <> 'sv')),
  tr_be = COALESCE(tr_be, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'be' AND COALESCE(d.language_code, '') <> 'be')),
  tr_ru = COALESCE(tr_ru, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'ru' AND COALESCE(d.language_code, '') <> 'ru')),
  tr_de = COALESCE(tr_de, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'de' AND COALESCE(d.language_code, '') <> 'de')),
  tr_fr = COALESCE(tr_fr, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'fr' AND COALESCE(d.language_code, '') <> 'fr')),
  tr_es = COALESCE(tr_es, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'es' AND COALESCE(d.language_code, '') <> 'es')),
  tr_it = COALESCE(tr_it, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'it' AND COALESCE(d.language_code, '') <> 'it')),
  tr_tr = COALESCE(tr_tr, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'tr' AND COALESCE(d.language_code, '') <> 'tr')),
  tr_ar = COALESCE(tr_ar, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'ar' AND COALESCE(d.language_code, '') <> 'ar')),
  tr_pl = COALESCE(tr_pl, EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'pl' AND COALESCE(d.language_code, '') <> 'pl'))
WHERE
  tr_en IS NULL OR tr_uk IS NULL OR tr_sv IS NULL OR tr_be IS NULL OR tr_ru IS NULL
  OR tr_de IS NULL OR tr_fr IS NULL OR tr_es IS NULL OR tr_it IS NULL
  OR tr_tr IS NULL OR tr_ar IS NULL OR tr_pl IS NULL;

-- ============================================================
-- 2. Колонка sentences_count
-- ============================================================
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS sentences_count INTEGER;

-- Заполняем для записей, где NULL
UPDATE dictations d
SET sentences_count = COALESCE(sentences_count, sub.cnt)
FROM (
  SELECT dictation_id, COUNT(*)::int AS cnt
  FROM dictation_sentences s
  JOIN dictations d2 ON d2.id = s.dictation_id
  WHERE s.language_code = d2.language_code
  GROUP BY dictation_id
) AS sub
WHERE sub.dictation_id = d.id AND d.sentences_count IS NULL;

UPDATE dictations SET sentences_count = COALESCE(sentences_count, 0) WHERE sentences_count IS NULL;

-- ============================================================
-- 3. Колонка audio_order
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dictations' AND column_name = 'audio_order'
  ) THEN
    ALTER TABLE dictations ADD COLUMN audio_order VARCHAR(1) DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- 4. Колонка title_translations_json
-- ============================================================
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS title_translations_json TEXT;

-- ============================================================
-- 5. Колонка author_materials_url
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dictations' AND column_name = 'author_materials_url'
  ) THEN
    ALTER TABLE dictations ADD COLUMN author_materials_url VARCHAR(500);
  END IF;
END $$;

-- ============================================================
-- 6. Колонка remember_unfinished_dictations
-- ============================================================
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS remember_unfinished_dictations BOOLEAN;

COMMIT;
