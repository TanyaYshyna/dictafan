-- Миграция: добавить финансовые/ошибочные метрики в history_by_day

BEGIN;

ALTER TABLE history_by_day
    ADD COLUMN IF NOT EXISTS money_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mistake_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS simbols INTEGER NOT NULL DEFAULT 0;

COMMIT;
