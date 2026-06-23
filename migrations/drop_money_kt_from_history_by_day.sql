-- Миграция: удалить money_kt_count из history_by_day
-- После отказа от платного обмена (покупка полузвезды/микрофона за монеты)
-- колонка money_kt_count больше не нужна.

ALTER TABLE history_by_day DROP COLUMN IF EXISTS money_kt_count;
