-- Миграция: исправить данные в history_by_day для dictation_id=70
--
-- Проблема: после отладки механизма сохранения успехов обнаружены некорректные записи:
--   id=2820 (2026-07-19, positions=[], successes=0) — был успех, но successes=0
--   id=2968 (2026-07-20, positions=[], successes=0) — был успех, но successes=0
--   id=2826 (2026-07-20, positions=[1..20], successes=0) — полный диктант, но positions
--            содержит список всех предложений вместо пустого массива
--
-- ВНИМАНИЕ: ID записей могут отличаться на тестовой и продакшен БД.
-- Перед запуском проверьте актуальные ID на своей БД.

BEGIN;

-- 1) Исправляем successes для записей, где был успех, но successes=0
UPDATE history_by_day SET successes = 1 WHERE id = 2820;
UPDATE history_by_day SET successes = 1 WHERE id = 2968;

-- 2) Исправляем positions для id=2826: полный диктант → пустой массив
UPDATE history_by_day
SET positions = '{}'
WHERE id = 2826
  AND positions IS DISTINCT FROM '{}';

COMMIT;
