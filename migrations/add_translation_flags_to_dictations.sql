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

UPDATE dictations d
SET
  tr_en = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'en' AND COALESCE(d.language_code, '') <> 'en'),
  tr_uk = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'uk' AND COALESCE(d.language_code, '') <> 'uk'),
  tr_sv = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'sv' AND COALESCE(d.language_code, '') <> 'sv'),
  tr_be = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'be' AND COALESCE(d.language_code, '') <> 'be'),
  tr_ru = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'ru' AND COALESCE(d.language_code, '') <> 'ru'),
  tr_de = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'de' AND COALESCE(d.language_code, '') <> 'de'),
  tr_fr = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'fr' AND COALESCE(d.language_code, '') <> 'fr'),
  tr_es = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'es' AND COALESCE(d.language_code, '') <> 'es'),
  tr_it = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'it' AND COALESCE(d.language_code, '') <> 'it'),
  tr_tr = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'tr' AND COALESCE(d.language_code, '') <> 'tr'),
  tr_ar = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'ar' AND COALESCE(d.language_code, '') <> 'ar'),
  tr_pl = EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = d.id AND s.language_code = 'pl' AND COALESCE(d.language_code, '') <> 'pl');

CREATE INDEX IF NOT EXISTS idx_dictations_tr_en_true ON dictations (id) WHERE tr_en IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_uk_true ON dictations (id) WHERE tr_uk IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_sv_true ON dictations (id) WHERE tr_sv IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_be_true ON dictations (id) WHERE tr_be IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_ru_true ON dictations (id) WHERE tr_ru IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_de_true ON dictations (id) WHERE tr_de IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_fr_true ON dictations (id) WHERE tr_fr IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_es_true ON dictations (id) WHERE tr_es IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_it_true ON dictations (id) WHERE tr_it IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_tr_true ON dictations (id) WHERE tr_tr IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_ar_true ON dictations (id) WHERE tr_ar IS TRUE;
CREATE INDEX IF NOT EXISTS idx_dictations_tr_pl_true ON dictations (id) WHERE tr_pl IS TRUE;
