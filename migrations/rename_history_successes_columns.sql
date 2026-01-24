-- Миграция: переименование колонок в history_successes и удаление UNIQUE constraint
-- Для каждого успеха (завершения диктанта) создается отдельная запись

BEGIN;

-- Переименовываем колонки
ALTER TABLE history_successes 
    RENAME COLUMN type_activity_perfect TO perfect_count;

ALTER TABLE history_successes 
    RENAME COLUMN type_activity_corrected TO corrected_count;

ALTER TABLE history_successes 
    RENAME COLUMN type_activity_audio TO audio_count;

-- Обновляем комментарии
COMMENT ON COLUMN history_successes.perfect_count IS 'Число предложений сделанных на звезду (perfect)';
COMMENT ON COLUMN history_successes.corrected_count IS 'Число предложений сделанных на полузвезду (corrected)';
COMMENT ON COLUMN history_successes.audio_count IS 'Число засчитанных аудио';

-- Удаляем UNIQUE constraint, чтобы можно было создавать несколько записей для одного диктанта
-- (каждое завершение диктанта - отдельная запись с временем победы)
ALTER TABLE history_successes 
    DROP CONSTRAINT IF EXISTS uq_history_successes_user_dictation;

-- Обновляем комментарий таблицы
COMMENT ON TABLE history_successes IS 'История успешных завершений диктантов (каждое завершение - отдельная запись)';

COMMIT;

