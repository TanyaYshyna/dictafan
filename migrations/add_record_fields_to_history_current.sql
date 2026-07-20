-- Миграция: добавить поля рекорда в таблицу history_current
--
-- Добавляем поля:
--   mistake_count  INTEGER NOT NULL DEFAULT 0  — количество ошибок в рекорде
--   lead_time      BIGINT NOT NULL DEFAULT 0    — время рекорда в миллисекундах
--   id_record      BIGINT NOT NULL              — ссылка на id в dictation_records
--
-- Идея: теперь рекорд хранится прямо в history_current, что позволяет
-- получать количество побед И рекорд одним запросом.
-- Первое выполнение диктанта всегда становится рекордом, поэтому
-- id_record всегда заполнен для любой записи history_current.
--
-- Таблица dictation_records остаётся как источник правды для полных данных
-- рекорда (date_of_victory, perfect_count, corrected_count и т.д.),
-- а history_current хранит только ключевые поля для сравнения (mistake_count, lead_time)
-- и ссылку id_record на dictation_records.id.
--
-- После добавления полей заполняем их из существующих записей dictation_records.

BEGIN;

-- ============================================================
-- 1. Добавляем поля в history_current
-- ============================================================
ALTER TABLE history_current
    ADD COLUMN IF NOT EXISTS mistake_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE history_current
    ADD COLUMN IF NOT EXISTS lead_time BIGINT NOT NULL DEFAULT 0;

ALTER TABLE history_current
    ADD COLUMN IF NOT EXISTS id_record BIGINT;

-- ============================================================
-- 2. Заполняем поля рекорда из dictation_records
--    Для каждого (user_id, dictation_id, positions) берём рекорд
--    и сохраняем его mistake_count, lead_time, id в history_current
-- ============================================================
UPDATE history_current hc
SET
    mistake_count = COALESCE(dr.mistake_count, 0),
    lead_time = COALESCE(dr.lead_time, 0),
    id_record = dr.id,
    updated_at = CURRENT_TIMESTAMP
FROM dictation_records dr
WHERE hc.user_id = dr.user_id
  AND hc.dictation_id = dr.dictation_id
  AND hc.positions = dr.positions;

-- ============================================================
-- 3. Для записей history_current, где нет рекорда в dictation_records
--    (не должно быть, но на всякий случай), создаём рекорд из данных
--    самого первого выполнения в history_by_day
-- ============================================================
INSERT INTO dictation_records (
    user_id, dictation_id, positions, date_of_victory,
    perfect_count, corrected_count, audio_count, activity_count,
    lead_time, mistake_count, monenumber_of_characters, money_dt_count,
    created_at, updated_at
)
SELECT
    hc.user_id,
    hc.dictation_id,
    hc.positions,
    hbd.created_at,
    COALESCE(hbd.perfect_count, 0),
    COALESCE(hbd.corrected_count, 0),
    COALESCE(hbd.audio_count, 0),
    COALESCE(hbd.activity_count, 0),
    COALESCE(hbd.lead_time, 0),
    COALESCE(hbd.mistake_count, 0),
    COALESCE(hbd.monenumber_of_characters, 0),
    COALESCE(hbd.money_dt_count, 0),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM history_current hc
JOIN LATERAL (
    SELECT *
    FROM history_by_day hbd2
    WHERE hbd2.user_id = hc.user_id
      AND hbd2.dictation_id = hc.dictation_id
      AND hbd2.positions = hc.positions
    ORDER BY hbd2.created_at ASC
    LIMIT 1
) hbd ON true
WHERE hc.id_record IS NULL;

-- ============================================================
-- 4. Обновляем id_record для записей, которые только что получили рекорд
-- ============================================================
UPDATE history_current hc
SET
    id_record = dr.id,
    mistake_count = COALESCE(dr.mistake_count, 0),
    lead_time = COALESCE(dr.lead_time, 0),
    updated_at = CURRENT_TIMESTAMP
FROM dictation_records dr
WHERE hc.user_id = dr.user_id
  AND hc.dictation_id = dr.dictation_id
  AND hc.positions = dr.positions
  AND hc.id_record IS NULL;

-- ============================================================
-- 5. Теперь все записи history_current должны иметь id_record.
--    Ставим NOT NULL constraint.
-- ============================================================
ALTER TABLE history_current
    ALTER COLUMN id_record SET NOT NULL;

COMMIT;
