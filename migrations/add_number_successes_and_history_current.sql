-- Миграция: добавить поле number_successes в history_by_day
-- и создать таблицу history_current для быстрого доступа к количеству побед
--
-- number_successes в history_by_day — это сумма successes нарастающим итогом
-- на дату записи (включая текущую запись).
-- Это нужно для быстрого получения количества побед на конкретную дату.
--
-- history_current — это актуальное количество побед по каждому упражнению
-- (пара dictation_id + positions) для пользователя.
-- Пересчитывается при каждом добавлении успеха.

BEGIN;

-- ============================================================
-- 1. Добавляем поле number_successes в history_by_day
-- ============================================================
ALTER TABLE history_by_day
    ADD COLUMN IF NOT EXISTS number_successes INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Заполняем number_successes для существующих записей
--    number_successes = сумма successes по всем записям
--    для данного (user_id, dictation_id, positions)
--    с date_fact <= текущей date_fact, отсортированным по created_at
-- ============================================================
WITH cumulative AS (
    SELECT
        id,
        user_id,
        dictation_id,
        positions,
        date_fact,
        created_at,
        successes,
        SUM(successes) OVER (
            PARTITION BY user_id, dictation_id, positions
            ORDER BY date_fact ASC, created_at ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_total
    FROM history_by_day
)
UPDATE history_by_day hbd
SET
    number_successes = c.running_total,
    updated_at = CURRENT_TIMESTAMP
FROM cumulative c
WHERE hbd.id = c.id
  AND c.running_total != COALESCE(hbd.number_successes, 0);

-- ============================================================
-- 3. Создаём таблицу history_current
-- ============================================================
CREATE TABLE IF NOT EXISTS history_current (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    dictation_id    INTEGER NOT NULL,
    positions       INTEGER[] NOT NULL DEFAULT '{}',
    number_successes INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Уникальность: один пользователь — одно упражнение (dictation_id + positions)
    CONSTRAINT uq_history_current_user_exercise
        UNIQUE (user_id, dictation_id, positions)
);

-- Индекс для быстрого поиска по пользователю
CREATE INDEX IF NOT EXISTS idx_history_current_user_id
    ON history_current(user_id);

-- Индекс для быстрого поиска по пользователю и диктанту
CREATE INDEX IF NOT EXISTS idx_history_current_user_dictation
    ON history_current(user_id, dictation_id);

-- ============================================================
-- 4. Заполняем history_current из history_by_day
--    number_successes = полная сумма successes по всем записям
--    для данного (user_id, dictation_id, positions)
-- ============================================================
INSERT INTO history_current (
    user_id,
    dictation_id,
    positions,
    number_successes,
    created_at,
    updated_at
)
SELECT
    hbd.user_id,
    hbd.dictation_id,
    hbd.positions,
    SUM(hbd.successes) AS number_successes,
    MIN(hbd.created_at) AS created_at,
    MAX(hbd.updated_at) AS updated_at
FROM history_by_day hbd
GROUP BY
    hbd.user_id,
    hbd.dictation_id,
    hbd.positions
ON CONFLICT (user_id, dictation_id, positions)
DO UPDATE SET
    number_successes = EXCLUDED.number_successes,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
