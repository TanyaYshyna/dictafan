-- Миграция: добавить date_start (дата начала) в history_by_day и user_money_ledger,
-- и date_fact (дата завершения) в user_money_ledger.
-- date_start — дата, когда пользователь начал диктант (без времени)
-- date_fact — дата, когда пользователь завершил диктант (без времени)
--
-- Для существующих записей проставляем дату из created_at (без времени).

BEGIN;

-- ========== history_by_day ==========
ALTER TABLE history_by_day
    ADD COLUMN IF NOT EXISTS date_start DATE;

-- Для существующих записей: date_start = date_fact (т.к. раньше не хранили дату начала)
UPDATE history_by_day
SET date_start = date_fact
WHERE date_start IS NULL;

ALTER TABLE history_by_day
    ALTER COLUMN date_start SET NOT NULL;

-- ========== user_money_ledger ==========
ALTER TABLE user_money_ledger
    ADD COLUMN IF NOT EXISTS date_start DATE,
    ADD COLUMN IF NOT EXISTS date_fact DATE;

-- Для существующих записей: date_start = date_fact = created_at::date
UPDATE user_money_ledger
SET date_start = created_at::date,
    date_fact = created_at::date
WHERE date_start IS NULL OR date_fact IS NULL;

ALTER TABLE user_money_ledger
    ALTER COLUMN date_start SET NOT NULL,
    ALTER COLUMN date_fact SET NOT NULL;

COMMIT;
