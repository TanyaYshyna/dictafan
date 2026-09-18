-- Миграция: привести history_by_day.positions к единому виду '{}'::int[] (пустой массив).
--
-- Проблема: колонка positions объявлена как INTEGER[] NOT NULL DEFAULT '{}', но в части
-- строк оказался NULL из-за исторического бага при переносе данных
-- (migrate_history_activity_and_successes_to_history_by_day.sql копировал
-- ha.selected_sentence_positions AS positions без COALESCE). В PostgreSQL NULL и '{}' —
-- РАЗНЫЕ значения: они не схлопываются по уникальному ключу и по GROUP BY,
-- поэтому один и тот же «весь диктант» распадался на две независимые строки
-- с отдельной нумерацией number_successes (в отчёте это выглядело как
-- «Dict 1» vs «↳ Весь диктант»).
--
-- Уникальный ключ history_by_day:
--   (user_id, teacher_id, dictation_id, positions, date_plan, date_fact, date_start)
--
-- Миграция делает три вещи:
--   1) Если для NULL-строк уже существует строка с positions='{}' с тем же ключом —
--      суммируем счётчики NULL-строк в существующую '{}'-строку.
--   2) Для групп NULL-строк, у которых НЕТ '{}'-двойника, выбираем одну строку-носитель
--      (минимальный id), проставляем ей positions='{}' и суммируем в неё счётчики
--      всей группы (иначе несколько NULL-строк с одинаковым ключом, превратившись в '{}',
--      нарушили бы уникальный ключ).
--   3) Удаляем все оставшиеся NULL-строки, у которых теперь есть '{}'-двойник
--      с тем же ключом.
--
-- ВАЖНО: после этой миграции необходимо пересчитать number_successes
-- (кнопка «Пересчитать количество проходов» / POST /api/statistics/success/recalc_all),
-- т.к. после слияния строк нумерация проходов станет сквозной.

BEGIN;

-- ============================================================
-- 1. Слияние NULL-строк в существующие '{}'-строки с тем же ключом
-- ============================================================
WITH null_agg AS (
    SELECT
        user_id,
        teacher_id,
        dictation_id,
        date_plan,
        date_fact,
        date_start,
        SUM(COALESCE(perfect_count, 0))            AS perfect_count,
        SUM(COALESCE(corrected_count, 0))          AS corrected_count,
        SUM(COALESCE(audio_count, 0))              AS audio_count,
        SUM(COALESCE(monenumber_of_characters, 0)) AS monenumber_of_characters,
        SUM(COALESCE(mistake_count, 0))            AS mistake_count,
        SUM(COALESCE(lead_time, 0))                AS lead_time,
        SUM(COALESCE(successes, 0))                AS successes,
        SUM(COALESCE(activity_count, 0))           AS activity_count,
        SUM(COALESCE(money_dt_count, 0))           AS money_dt_count,
        MIN(dictation_language_code)               AS dictation_language_code
    FROM history_by_day
    WHERE positions IS NULL
    GROUP BY user_id, teacher_id, dictation_id, date_plan, date_fact, date_start
)
UPDATE history_by_day hbd
SET
    perfect_count            = COALESCE(hbd.perfect_count, 0) + na.perfect_count,
    corrected_count          = COALESCE(hbd.corrected_count, 0) + na.corrected_count,
    audio_count              = COALESCE(hbd.audio_count, 0) + na.audio_count,
    monenumber_of_characters = COALESCE(hbd.monenumber_of_characters, 0) + na.monenumber_of_characters,
    mistake_count            = COALESCE(hbd.mistake_count, 0) + na.mistake_count,
    lead_time                = COALESCE(hbd.lead_time, 0) + na.lead_time,
    successes                = COALESCE(hbd.successes, 0) + na.successes,
    activity_count           = COALESCE(hbd.activity_count, 0) + na.activity_count,
    money_dt_count           = COALESCE(hbd.money_dt_count, 0) + na.money_dt_count,
    dictation_language_code  = COALESCE(hbd.dictation_language_code, na.dictation_language_code),
    date_start               = COALESCE(hbd.date_start, na.date_start),
    updated_at               = CURRENT_TIMESTAMP
FROM null_agg na
WHERE hbd.positions = '{}'
  AND hbd.user_id = na.user_id
  AND hbd.teacher_id = na.teacher_id
  AND hbd.dictation_id = na.dictation_id
  AND hbd.date_plan = na.date_plan
  AND hbd.date_fact = na.date_fact
  AND hbd.date_start IS NOT DISTINCT FROM na.date_start;

-- ============================================================
-- 2. Для групп NULL-строк без '{}'-двойника: создаём строку-носитель
-- ============================================================
WITH null_groups AS (
    SELECT
        n.user_id,
        n.teacher_id,
        n.dictation_id,
        n.date_plan,
        n.date_fact,
        n.date_start,
        MIN(n.id)                                    AS keep_id,
        SUM(COALESCE(n.perfect_count, 0))            AS perfect_count,
        SUM(COALESCE(n.corrected_count, 0))          AS corrected_count,
        SUM(COALESCE(n.audio_count, 0))              AS audio_count,
        SUM(COALESCE(n.monenumber_of_characters, 0)) AS monenumber_of_characters,
        SUM(COALESCE(n.mistake_count, 0))            AS mistake_count,
        SUM(COALESCE(n.lead_time, 0))                AS lead_time,
        SUM(COALESCE(n.successes, 0))                AS successes,
        SUM(COALESCE(n.activity_count, 0))           AS activity_count,
        SUM(COALESCE(n.money_dt_count, 0))           AS money_dt_count,
        MIN(n.dictation_language_code)               AS dictation_language_code
    FROM history_by_day n
    WHERE n.positions IS NULL
    GROUP BY n.user_id, n.teacher_id, n.dictation_id, n.date_plan, n.date_fact, n.date_start
)
UPDATE history_by_day hbd
SET
    positions                = '{}',
    perfect_count            = ng.perfect_count,
    corrected_count          = ng.corrected_count,
    audio_count              = ng.audio_count,
    monenumber_of_characters = ng.monenumber_of_characters,
    mistake_count            = ng.mistake_count,
    lead_time                = ng.lead_time,
    successes                = ng.successes,
    activity_count           = ng.activity_count,
    money_dt_count           = ng.money_dt_count,
    dictation_language_code  = ng.dictation_language_code,
    date_start               = COALESCE(hbd.date_start, ng.date_start),
    updated_at               = CURRENT_TIMESTAMP
FROM null_groups ng
LEFT JOIN history_by_day e
    ON e.positions = '{}'
   AND e.user_id = ng.user_id
   AND e.teacher_id = ng.teacher_id
   AND e.dictation_id = ng.dictation_id
   AND e.date_plan = ng.date_plan
   AND e.date_fact = ng.date_fact
   AND e.date_start IS NOT DISTINCT FROM ng.date_start
WHERE hbd.id = ng.keep_id
  AND e.id IS NULL;

-- ============================================================
-- 3. Удаляем NULL-строки, у которых теперь есть '{}'-двойник
-- ============================================================
DELETE FROM history_by_day n
USING history_by_day hbd
WHERE n.positions IS NULL
  AND hbd.positions = '{}'
  AND n.user_id = hbd.user_id
  AND n.teacher_id = hbd.teacher_id
  AND n.dictation_id = hbd.dictation_id
  AND n.date_plan = hbd.date_plan
  AND n.date_fact = hbd.date_fact
  AND n.date_start IS NOT DISTINCT FROM hbd.date_start
  AND n.id <> hbd.id;

COMMIT;
