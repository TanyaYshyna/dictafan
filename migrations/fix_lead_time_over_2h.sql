-- fix_lead_time_over_2h.sql
-- Обнуляем раздутый lead_time в history_by_day.
--
-- Причина: баг восстановления таймера диктанта из IndexedDB
-- (DictationSession.fromJSON восстанавливал running=true со старым startedAtMs,
--  поэтому getElapsedMs() возвращал накопленные сутки/недели настенного времени).
-- Гигантские дельты суммировались в history_by_day.lead_time.
--
-- Строки с lead_time больше 2 часов (7200000 мс) считаются испорченными:
-- за одну сессию диктанта физически невозможно набрать больше 2 часов.
-- Остальные значения (<= 2 часов) не трогаем — это корректные данные.

UPDATE history_by_day
SET lead_time = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE lead_time > 7200000;

-- Проверка после выполнения:
-- SELECT date_fact,
--        ROUND(SUM(lead_time) / 60000.0, 2) AS total_min,
--        COUNT(*) AS rows_count
-- FROM history_by_day
-- WHERE lead_time > 0
-- GROUP BY date_fact
-- ORDER BY total_min DESC;
