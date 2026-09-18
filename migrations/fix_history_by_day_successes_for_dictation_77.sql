-- Миграция: исправить successes для полных проходов диктанта dictation_id=77
-- (user_id=3), где successes так и не был записан (successes=0).
--
-- ПРИЧИНА БАГА (клиент): при завершении диктанта через кнопку «Далее» или
-- через обмен монет окно успеха показывалось напрямую (showCompletionModal),
-- минуя handleActivity → successes не попадал в outbox. В итоге в history_by_day
-- для полного диктанта (positions='{}') копились записи с successes=0, а
-- number_successes и history_current (медаль 🥇) считались как 0.
--
-- ЭВРИСТИКА: полный проход диктанта считаем состоявшимся, если в записи есть
-- свидетельство завершения ВСЕХ предложений:
--   * текстовый проход: perfect_count + corrected_count >= sentences_count
--     (каждое предложение закрыто звездой/полузвездой);
--   * аудио-проход (режимы p3/p4): audio_count >= sentences_count
--     (каждое предложение озвучено нужное число повторов).
--
-- ВНИМАНИЕ:
--   * Подмножества (positions != '{}') НЕ трогаем — они уже корректны.
--   * Перед запуском сверьтесь с диагностическим SELECT ниже (закомментирован),
--     чтобы убедиться, что количество помеченных строк соответствует ожидаемому
--     числу реальных проходов (у Фарука ~10). Если эвристика захватила лишние
--     «недоделанные» попытки — сузьте WHERE вручную по id/date_start.
--   * Миграция идемпотентна: повторный запуск не добавит лишних successes.

BEGIN;

-- ============================================================
-- 0. ДИАГНОСТИКА (раскомментируйте при необходимости)
-- ============================================================
-- SELECT
--     hbd.id,
--     hbd.date_fact,
--     hbd.date_start,
--     hbd.positions,
--     hbd.perfect_count,
--     hbd.corrected_count,
--     hbd.audio_count,
--     hbd.monenumber_of_characters,
--     hbd.lead_time,
--     hbd.successes,
--     hbd.number_successes,
--     d.sentences_count,
--     (hbd.perfect_count + hbd.corrected_count) AS text_done
-- FROM history_by_day hbd
-- LEFT JOIN dictations d ON d.id = hbd.dictation_id
-- WHERE hbd.user_id = 3
--   AND hbd.dictation_id = 77
-- ORDER BY hbd.date_fact ASC, hbd.date_start ASC, hbd.id ASC;

-- ============================================================
-- 1. Проставляем successes=1 для состоявшихся полных проходов
-- ============================================================
UPDATE history_by_day hbd
SET successes = 1,
    updated_at = CURRENT_TIMESTAMP
FROM dictations d
WHERE hbd.user_id = 3
  AND hbd.dictation_id = 77
  AND hbd.dictation_id = d.id
  AND (hbd.positions IS NULL OR hbd.positions = '{}')
  AND hbd.successes = 0
  AND COALESCE(d.sentences_count, 0) > 0
  AND (
        (COALESCE(hbd.perfect_count, 0) + COALESCE(hbd.corrected_count, 0)) >= d.sentences_count
     OR COALESCE(hbd.audio_count, 0) >= d.sentences_count
  );

-- ============================================================
-- 2. Пересчитываем number_successes (нарастающий итог) для
--    (user_id=3, dictation_id=77, positions='{}')
-- ============================================================
WITH cumulative AS (
    SELECT
        id,
        SUM(successes) OVER (
            PARTITION BY user_id, dictation_id, positions
            ORDER BY date_fact ASC, created_at ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_total
    FROM history_by_day
    WHERE user_id = 3
      AND dictation_id = 77
      AND (positions IS NULL OR positions = '{}')
)
UPDATE history_by_day hbd
SET number_successes = c.running_total,
    updated_at = CURRENT_TIMESTAMP
FROM cumulative c
WHERE hbd.id = c.id
  AND c.running_total != COALESCE(hbd.number_successes, 0);

-- ============================================================
-- 3. Обновляем history_current (медаль 🥇) для этого упражнения
--    (только number_successes, поля рекорда не трогаем)
-- ============================================================
INSERT INTO history_current (user_id, dictation_id, positions, number_successes, created_at, updated_at)
SELECT
    3 AS user_id,
    77 AS dictation_id,
    '{}' AS positions,
    COALESCE(SUM(hbd.successes), 0) AS number_successes,
    MIN(hbd.created_at) AS created_at,
    MAX(hbd.updated_at) AS updated_at
FROM history_by_day hbd
WHERE hbd.user_id = 3
  AND hbd.dictation_id = 77
  AND (hbd.positions IS NULL OR hbd.positions = '{}')
ON CONFLICT (user_id, dictation_id, positions)
DO UPDATE SET
    number_successes = (
        SELECT COALESCE(SUM(hbd2.successes), 0)
        FROM history_by_day hbd2
        WHERE hbd2.user_id = 3
          AND hbd2.dictation_id = 77
          AND (hbd2.positions IS NULL OR hbd2.positions = '{}')
    ),
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
