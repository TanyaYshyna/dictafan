-- Миграция: добавление поля audio_settings_json в таблицу users
-- Revision ID: audio_settings_json_001
-- Revises: a1b2c3d4e5f6

BEGIN;

-- Добавляем поле audio_settings_json в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS audio_settings_json TEXT;

COMMENT ON COLUMN users.audio_settings_json IS 'JSON с настройками аудио для диктантов: {"start": "oto", "typo": "o", "success": "ot", "repeats": 3, "without_entering_text": false, "show_text": false}';

COMMIT;

