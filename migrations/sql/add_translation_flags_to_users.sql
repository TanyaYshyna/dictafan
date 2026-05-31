BEGIN;

-- Add users.tr_* flags (similar to dictations.tr_*)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_en BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_uk BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_sv BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_be BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_ru BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_de BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_fr BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_es BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_it BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_tr BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_ar BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tr_pl BOOLEAN NOT NULL DEFAULT FALSE;

-- Fill: for each user set exactly one flag TRUE based on current_learning
UPDATE users
SET
  tr_en = (COALESCE(current_learning, '') = 'en'),
  tr_uk = (COALESCE(current_learning, '') = 'uk'),
  tr_sv = (COALESCE(current_learning, '') = 'sv'),
  tr_be = (COALESCE(current_learning, '') = 'be'),
  tr_ru = (COALESCE(current_learning, '') = 'ru'),
  tr_de = (COALESCE(current_learning, '') = 'de'),
  tr_fr = (COALESCE(current_learning, '') = 'fr'),
  tr_es = (COALESCE(current_learning, '') = 'es'),
  tr_it = (COALESCE(current_learning, '') = 'it'),
  tr_tr = (COALESCE(current_learning, '') = 'tr'),
  tr_ar = (COALESCE(current_learning, '') = 'ar'),
  tr_pl = (COALESCE(current_learning, '') = 'pl');

COMMIT;
