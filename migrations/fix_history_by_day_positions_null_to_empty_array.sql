-- Миграция: проставить пустой массив {} вместо NULL в history_by_day.positions
--
-- Проблема: колонка positions в history_by_day объявлена как INTEGER[] NOT NULL DEFAULT '{}',
-- но в некоторых записях оказался NULL из-за бага при вставке (selected_sentence_positions
-- передавался как None, но _normalize_selected_s_positions могла не сработать в некоторых
-- ветках кода, и positions_arr оказывался None).
--
-- Это вызывает 500 ошибку в recalc_history_current_for_user(), т.к. GROUP BY hbd.positions
-- и LEFT JOIN ... AND dr.positions = hbd.positions не работают корректно с NULL.

BEGIN;

UPDATE history_by_day
SET positions = '{}'
WHERE positions IS NULL;

COMMIT;
