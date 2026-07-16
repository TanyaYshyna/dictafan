-- Миграция: добавляем audio_order в dictations, переименовываем поля в dictation_sentences
-- 1. audio_order — порядок воспроизведения аудио (ofm, fom, mof и т.д.)
-- 2. audio_avto → удаляем (больше не нужно)
-- 3. audio_user → audio_file (пользовательский файл)

-- ============================================================
-- 1. Добавляем audio_order в таблицу dictations
-- ============================================================
ALTER TABLE dictations
ADD COLUMN IF NOT EXISTS audio_order VARCHAR(3) DEFAULT 'ofm';

COMMENT ON COLUMN dictations.audio_order IS
'Порядок воспроизведения аудио для оригинального текста. Значение: строка из 3 букв o/f/m. Пустое = ofm. Примеры: ofm, fom, mof';

-- Обновляем существующие записи: если NULL, ставим 'ofm'
UPDATE dictations SET audio_order = 'ofm' WHERE audio_order IS NULL;

-- ============================================================
-- 2. Переименовываем audio_user → audio_file в dictation_sentences
-- ============================================================
ALTER TABLE dictation_sentences
RENAME COLUMN audio_user TO audio_file;

COMMENT ON COLUMN dictation_sentences.audio_file IS
'Пользовательский аудио файл (f) — вырезанный из общего файла или загруженный';

-- ============================================================
-- 3. Удаляем audio_avto из dictation_sentences
-- ============================================================
ALTER TABLE dictation_sentences
DROP COLUMN IF EXISTS audio_avto;

-- ============================================================
-- 4. Обновляем комментарий для поля audio (теперь это "o" — original/авто-озвучка)
-- ============================================================
COMMENT ON COLUMN dictation_sentences.audio IS
'Оригинальное аудио (o) — автоматически сгенерированная озвучка текста';
