-- Миграция: удаление таблиц history_activity и history_successes
-- Данные перенесены в history_by_day (миграция migrate_history_activity_and_successes_to_history_by_day.sql)
-- Весь код переведён на использование history_by_day

BEGIN;

DROP TABLE IF EXISTS history_activity CASCADE;
DROP TABLE IF EXISTS history_successes CASCADE;

COMMIT;
