-- Миграция: заменить колонку delta на dt (дебет) и kt (кредит) в таблице user_money_ledger
-- dt — приход (дебет), вся заработанная сумма
-- kt — расход (кредит), вся сумма за которую были куплены полузвёзды и микрофоны

BEGIN;

ALTER TABLE user_money_ledger
    ADD COLUMN IF NOT EXISTS dt BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS kt BIGINT NOT NULL DEFAULT 0;

-- Переносим данные из delta в dt или kt в зависимости от знака
UPDATE user_money_ledger
SET
    dt = CASE WHEN delta > 0 THEN delta ELSE 0 END,
    kt = CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END;

ALTER TABLE user_money_ledger
    DROP COLUMN IF EXISTS delta;

COMMIT;
