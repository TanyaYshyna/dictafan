-- Миграция: переименовать колонку money_count в monenumber_of_characters в таблице history_by_day

BEGIN;

ALTER TABLE history_by_day
    RENAME COLUMN money_count TO monenumber_of_characters;

COMMIT;
