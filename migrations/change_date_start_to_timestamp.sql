-- Миграция: сменить тип date_start с DATE на TIMESTAMP в history_by_day и user_money_ledger.
-- Это нужно, чтобы различать несколько подходов к одному диктанту в один день.
--
-- В history_by_day: date_start теперь хранит дату+время начала диктанта.
-- В user_money_ledger: date_start теперь хранит дату+время начала диктанта.
--
-- Для существующих записей: date_start = date_fact::timestamp (полночь, т.к. время не сохранялось).

BEGIN;

-- ========== history_by_day ==========
-- Меняем тип с DATE на TIMESTAMP (если ещё не изменено)
ALTER TABLE history_by_day
    ALTER COLUMN date_start TYPE TIMESTAMP USING date_start::timestamp;

-- Пересоздаём уникальный индекс: добавляем date_start,
-- чтобы разные подходы к одному диктанту в один день не схлопывались.
ALTER TABLE history_by_day DROP CONSTRAINT IF EXISTS uq_history_by_day;

ALTER TABLE history_by_day
    ADD CONSTRAINT uq_history_by_day UNIQUE (user_id, teacher_id, dictation_id, positions, date_plan, date_fact, date_start);

-- ========== user_money_ledger ==========
ALTER TABLE user_money_ledger
    ALTER COLUMN date_start TYPE TIMESTAMP USING date_start::timestamp;

COMMIT;
