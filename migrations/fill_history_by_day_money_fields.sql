-- Миграция: заполнить monenumber_of_characters и money_dt_count в history_by_day
-- на основе perfect_count, corrected_count, audio_count.
-- А также создать записи в user_money_ledger.dt для этих сумм.
--
-- Формулы:
--   monenumber_of_characters = (perfect_count + corrected_count) * 30
--   money_dt_count = perfect_count * 3 + corrected_count * 2 + audio_count * 1
--
--   user_money_ledger.dt = money_dt_count (зачисление монет)
--
-- Дополнительно: исправляем activity_count и successes для строк,
-- которые были перенесены из history_activity с перепутанными значениями.

BEGIN;

-- ============================================================
-- 0. Исправляем activity_count и successes для строк, где
--    activity_count = 1, а successes = 0 (было перепутано в первой версии миграции)
-- ============================================================
UPDATE history_by_day
SET
    successes = 1,
    activity_count = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE
    activity_count = 1
    AND successes = 0
    AND (COALESCE(perfect_count, 0) + COALESCE(corrected_count, 0) + COALESCE(audio_count, 0)) > 0;

-- ============================================================
-- 1. Заполняем monenumber_of_characters и money_dt_count в history_by_day
--    только для тех строк, где эти поля = 0 (ещё не заполнены)
-- ============================================================
UPDATE history_by_day
SET
    monenumber_of_characters = (COALESCE(perfect_count, 0) + COALESCE(corrected_count, 0)) * 30,
    money_dt_count = COALESCE(perfect_count, 0) * 3 + COALESCE(corrected_count, 0) * 2 + COALESCE(audio_count, 0) * 1,
    updated_at = CURRENT_TIMESTAMP
WHERE
    (monenumber_of_characters IS NULL OR monenumber_of_characters = 0)
    AND (money_dt_count IS NULL OR money_dt_count = 0)
    AND (COALESCE(perfect_count, 0) + COALESCE(corrected_count, 0) + COALESCE(audio_count, 0)) > 0;

-- ============================================================
-- 2. Создаём записи в user_money_ledger.dt для тех строк history_by_day,
--    где money_dt_count > 0 и ещё нет соответствующей записи в ledger
-- ============================================================
INSERT INTO user_money_ledger (user_id, dt, kt, reason, dictation_id, positions, date_start, date_fact, created_at)
SELECT
    hbd.user_id,
    hbd.money_dt_count AS dt,
    0 AS kt,
    'dictation_activity:' || hbd.dictation_id AS reason,
    hbd.dictation_id,
    hbd.positions,
    hbd.date_start,
    hbd.date_fact,
    CURRENT_TIMESTAMP
FROM history_by_day hbd
WHERE hbd.money_dt_count > 0
  AND NOT EXISTS (
    SELECT 1
    FROM user_money_ledger uml
    WHERE uml.user_id = hbd.user_id
      AND uml.dictation_id = hbd.dictation_id
      AND uml.date_fact = hbd.date_fact
      AND uml.dt = hbd.money_dt_count
      AND uml.reason LIKE 'dictation_activity:%'
);

COMMIT;
