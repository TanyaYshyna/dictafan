-- Миграция: перенос данных из history_activity и history_successes в history_by_day
--
-- history_activity — агрегированная активность по дням (будет удалена)
--   Переносим: user_id, dictation_id, date → date_fact/date_plan/date_start,
--              perfect_count, corrected_count, audio_count, lead_time,
--              dictation_language_code, selected_sentence_positions → positions
--   teacher_id = user_id (для себя)
--
-- history_successes — завершённые диктанты (будет удалена)
--   Переносим только факт завершения: каждая запись = +1 в successes
--
-- Целевая таблица: history_by_day с уникальным ключом
--   (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)

BEGIN;

-- ============================================================
-- 1. Перенос из history_activity
-- ============================================================
INSERT INTO history_by_day (
    user_id,
    teacher_id,
    dictation_language_code,
    dictation_id,
    positions,
    date_plan,
    date_fact,
    date_start,
    perfect_count,
    corrected_count,
    audio_count,
    lead_time,
    successes,
    activity_count,
    created_at,
    updated_at
)
SELECT
    ha.user_id,
    ha.user_id AS teacher_id,
    ha.dictation_language_code,
    ha.dictation_id,
    ha.selected_sentence_positions AS positions,
    ha.date AS date_plan,
    ha.date AS date_fact,
    ha.date AS date_start,
    ha.perfect_count,
    ha.corrected_count,
    ha.audio_count,
    ha.lead_time,
    0 AS successes,
    1 AS activity_count,
    ha.created_at,
    ha.updated_at
FROM history_activity ha
WHERE NOT EXISTS (
    SELECT 1
    FROM history_by_day hbd
    WHERE hbd.user_id = ha.user_id
      AND hbd.teacher_id = ha.user_id
      AND hbd.dictation_id = ha.dictation_id
      AND hbd.positions = ha.selected_sentence_positions
      AND hbd.date_plan = ha.date
      AND hbd.date_fact = ha.date
)
ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)
DO UPDATE SET
    perfect_count = COALESCE(history_by_day.perfect_count, 0) + EXCLUDED.perfect_count,
    corrected_count = COALESCE(history_by_day.corrected_count, 0) + EXCLUDED.corrected_count,
    audio_count = COALESCE(history_by_day.audio_count, 0) + EXCLUDED.audio_count,
    lead_time = COALESCE(history_by_day.lead_time, 0) + EXCLUDED.lead_time,
    activity_count = COALESCE(history_by_day.activity_count, 0) + EXCLUDED.activity_count,
    updated_at = GREATEST(history_by_day.updated_at, EXCLUDED.updated_at);

-- ============================================================
-- 2. Перенос из history_successes (только successes)
-- ============================================================
-- Сначала вставляем новые строки (те, которых ещё нет в history_by_day).
-- Если строка уже есть (из history_activity) — пропускаем вставку,
-- потом обновим её через UPDATE.

-- 2a. Вставка новых строк (только те, которых нет в history_by_day вообще)
INSERT INTO history_by_day (
    user_id,
    teacher_id,
    dictation_language_code,
    dictation_id,
    positions,
    date_plan,
    date_fact,
    date_start,
    perfect_count,
    corrected_count,
    audio_count,
    lead_time,
    successes,
    activity_count,
    created_at,
    updated_at
)
SELECT
    hs.user_id,
    COALESCE(g.teacher_id, hs.user_id) AS teacher_id,
    hs.dictation_language_code,
    hs.dictation_id,
    COALESCE(hs.selected_sentence_positions, '{}'::int[]) AS positions,
    hs.created_at::date AS date_plan,
    hs.created_at::date AS date_fact,
    COALESCE(hs.started_at::date, hs.created_at::date) AS date_start,
    0 AS perfect_count,
    0 AS corrected_count,
    0 AS audio_count,
    SUM(hs.time_ms) AS lead_time,
    COUNT(*) AS successes,
    0 AS activity_count,
    MIN(hs.created_at) AS created_at,
    MAX(hs.updated_at) AS updated_at
FROM history_successes hs
LEFT JOIN groups g ON hs.source_group_id = g.id
WHERE NOT EXISTS (
    SELECT 1
    FROM history_by_day hbd
    WHERE hbd.user_id = hs.user_id
      AND hbd.dictation_id = hs.dictation_id
      AND hbd.positions = COALESCE(hs.selected_sentence_positions, '{}'::int[])
      AND hbd.date_fact = hs.created_at::date
)
GROUP BY
    hs.user_id,
    COALESCE(g.teacher_id, hs.user_id),
    hs.dictation_language_code,
    hs.dictation_id,
    COALESCE(hs.selected_sentence_positions, '{}'::int[]),
    hs.created_at::date,
    COALESCE(hs.started_at::date, hs.created_at::date)
ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)
DO NOTHING;

-- 2b. Обновление существующих строк: добавляем successes и lead_time
--     к тем строкам, которые уже есть в history_by_day (из history_activity или предыдущих запусков)
UPDATE history_by_day hbd
SET
    successes = hbd.successes + hs_agg.successes,
    lead_time = hbd.lead_time + hs_agg.lead_time,
    updated_at = GREATEST(hbd.updated_at, hs_agg.max_updated_at)
FROM (
    SELECT
        hs.user_id,
        COALESCE(g.teacher_id, hs.user_id) AS teacher_id,
        hs.dictation_id,
        COALESCE(hs.selected_sentence_positions, '{}'::int[]) AS positions,
        hs.created_at::date AS date_fact,
        COUNT(*) AS successes,
        SUM(hs.time_ms) AS lead_time,
        MAX(hs.updated_at) AS max_updated_at
    FROM history_successes hs
    LEFT JOIN groups g ON hs.source_group_id = g.id
    GROUP BY
        hs.user_id,
        COALESCE(g.teacher_id, hs.user_id),
        hs.dictation_id,
        COALESCE(hs.selected_sentence_positions, '{}'::int[]),
        hs.created_at::date
) hs_agg
WHERE hbd.user_id = hs_agg.user_id
  AND hbd.teacher_id = hs_agg.teacher_id
  AND hbd.dictation_id = hs_agg.dictation_id
  AND hbd.positions = hs_agg.positions
  AND hbd.date_fact = hs_agg.date_fact;

COMMIT;
