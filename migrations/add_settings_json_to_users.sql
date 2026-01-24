-- Миграция: добавление поля settings_json в таблицу users
-- Revision ID: settings_json_001
-- Revises: settings_json_000

BEGIN;

-- Добавляем поле settings_json в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS settings_json TEXT;

COMMENT ON COLUMN users.settings_json IS 'JSON с настройками пользователя для диктантов: {"audio": {"start": "oto", "typo": "o", "success": "ot", "repeats": 1, "without_entering_text": false, "show_text": false}, ...}';

COMMIT;

