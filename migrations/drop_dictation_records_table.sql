-- Миграция: удаление таблицы dictation_records и колонки id_record из history_current
-- 
-- После рефакторинга вся функциональность рекордов перенесена в history_current
-- (поля mistake_count, lead_time). Таблица dictation_records больше не используется.
--
-- ВАЖНО: Перед запуском убедитесь, что:
--   1. Все изменения кода (helpers/db_history.py, routes/statistics.py,
--      static/js/outbox_batcher.js) уже deployed на сервер
--   2. Все pending записи в outbox (dictation_record) уже отправлены на сервер
--   3. Запущен recalc history_current (кнопка refresh на desktop)

BEGIN;

-- Шаг 1: Удаляем внешний ключ (если есть) и колонку id_record из history_current
ALTER TABLE history_current DROP COLUMN IF EXISTS id_record;

-- Шаг 2: Удаляем таблицу dictation_records
DROP TABLE IF EXISTS dictation_records;

COMMIT;
