-- Добавляем флаг "Диктант для первой загрузки" (Dictation for first download)
-- в таблицу dictations. Флаг показывает, что диктант должен быть
-- загружен/скачан первым.

ALTER TABLE dictations ADD COLUMN IF NOT EXISTS is_first_load BOOLEAN;

-- Частичный индекс для быстрого поиска диктантов с установленным флагом
CREATE INDEX IF NOT EXISTS idx_dictations_is_first_load_true ON dictations (id) WHERE is_first_load IS TRUE;
