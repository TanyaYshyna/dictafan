-- Миграция: удалить колонку simbols из таблицы history_by_day
-- (данные перенесены в monenumber_of_characters, таблица была пуста)

BEGIN;

ALTER TABLE history_by_day
    DROP COLUMN IF EXISTS simbols;

COMMIT;
