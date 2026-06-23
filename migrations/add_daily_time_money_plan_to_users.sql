-- Миграция: добавить daily_time_plan (план времени в минутах) и daily_money_plan (план монет)
-- в таблицу users

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_time_plan INTEGER NOT NULL DEFAULT 10;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_money_plan INTEGER NOT NULL DEFAULT 100;

COMMIT;
