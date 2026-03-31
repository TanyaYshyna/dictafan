-- Миграция: добавление поля assignment_history_retention_days в таблицу users
-- Значения: 0 / 7 / 30, по умолчанию 7
-- Revision ID: assignment_history_retention_days_001

BEGIN;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS assignment_history_retention_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_assignment_history_retention_days_check;

ALTER TABLE users
ADD CONSTRAINT users_assignment_history_retention_days_check
CHECK (assignment_history_retention_days IN (0, 7, 30));

COMMENT ON COLUMN users.assignment_history_retention_days IS 'Сколько дней хранить историю заданий (0/7/30). По умолчанию 7.';

COMMIT;
