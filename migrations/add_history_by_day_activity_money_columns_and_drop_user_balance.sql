-- Миграция: добавить activity_count, money_dt_count, money_kt_count в history_by_day
-- и удалить money_balance из users (баланс считаем из user_money_ledger)

BEGIN;

-- Новые колонки в history_by_day
ALTER TABLE history_by_day
    ADD COLUMN IF NOT EXISTS activity_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS money_dt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS money_kt_count INTEGER NOT NULL DEFAULT 0;

-- Удаляем дублирующее поле money_balance из users
ALTER TABLE users
    DROP COLUMN IF EXISTS money_balance;

COMMIT;
