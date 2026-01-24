-- Миграция: переименование колонок в таблицах незавершенных диктантов
-- 1. Переименование audio_settings_json в settings_json в history_unclosed_dictations
-- 2. Переименование колонок в history_unclosed_dictations_sentences

BEGIN;

-- 1. Переименовываем audio_settings_json в settings_json в history_unclosed_dictations
ALTER TABLE history_unclosed_dictations 
    RENAME COLUMN audio_settings_json TO settings_json;

-- Обновляем комментарий
COMMENT ON COLUMN history_unclosed_dictations.settings_json IS 'JSON с настройками диктанта: {"audio": {"start": "oto", "typo": "ot", "success": "to", "order": "mixed|direct", "repeats": 3}, "sentence_order": "mixed|direct", ...}';

-- 2. Переименовываем колонки в history_unclosed_dictations_sentences
ALTER TABLE history_unclosed_dictations_sentences 
    RENAME COLUMN type_activity_perfect TO perfect_count;

ALTER TABLE history_unclosed_dictations_sentences 
    RENAME COLUMN type_activity_corrected TO corrected_count;

ALTER TABLE history_unclosed_dictations_sentences 
    RENAME COLUMN type_activity_audio TO audio_count;

-- Обновляем комментарии
COMMENT ON COLUMN history_unclosed_dictations_sentences.perfect_count IS 'Число предложений сделанных на звезду';
COMMENT ON COLUMN history_unclosed_dictations_sentences.corrected_count IS 'Число предложений сделанных на полузвезду';
COMMENT ON COLUMN history_unclosed_dictations_sentences.audio_count IS 'Число засчитанных аудио';

COMMIT;



