-- fix_lead_time_by_symbols_before_20260915.sql
-- Восстанавливаем/корректируем lead_time в history_by_day для записей
-- с date_fact до 2026-09-15 (не включая саму дату).
--
-- Контекст: предыдущая миграция fix_lead_time_over_2h.sql обнуляла ВСЕ значения
-- lead_time > 2 часов (7200000 мс). Это убирало испорченные «настенные» значения
-- таймера (баг восстановления running=true из IndexedDB), но заодно теряло и
-- реально потраченное время у строк, где таймер был завышен не настолько,
-- чтобы выбрасывать его полностью.
--
-- Логика (lead_time в миллисекундах, символы — monenumber_of_characters):
--   1) Если lead_time = 0 и набраны символы (monenumber_of_characters > 0),
--      восстанавливаем оценку из расчёта 20 минут на 1000 символов:
--        lead_time = monenumber_of_characters * 1200   (1200 мс/символ)
--   2) Если lead_time > 0, оцениваем его адекватность по критерию
--      30 минут на 1000 символов. Если время больше этой пропорции,
--      уменьшаем до неё:
--        lead_time = monenumber_of_characters * 1800   (1800 мс/символ)
--
-- Пропорции:
--   20 минут = 1 200 000 мс на 1000 символов => 1200 мс/символ
--   30 минут = 1 800 000 мс на 1000 символов => 1800 мс/символ

BEGIN;

-- Шаг 1: восстановление оценки времени для нулевого lead_time.
UPDATE history_by_day
SET lead_time = COALESCE(monenumber_of_characters, 0) * 1200,
    updated_at = CURRENT_TIMESTAMP
WHERE date_fact < '2026-09-15'
  AND COALESCE(lead_time, 0) <= 0
  AND COALESCE(monenumber_of_characters, 0) > 0;

-- Шаг 2: ограничение завышенного времени пропорцией 30 минут / 1000 символов.
UPDATE history_by_day
SET lead_time = COALESCE(monenumber_of_characters, 0) * 1800,
    updated_at = CURRENT_TIMESTAMP
WHERE date_fact < '2026-09-15'
  AND COALESCE(lead_time, 0) > 0
  AND COALESCE(monenumber_of_characters, 0) > 0
  AND lead_time > COALESCE(monenumber_of_characters, 0) * 1800;

COMMIT;

-- Проверка после выполнения:
-- SELECT date_fact,
--        ROUND(SUM(lead_time) / 60000.0, 2) AS total_min,
--        COUNT(*) AS rows_count
-- FROM history_by_day
-- WHERE date_fact < '2026-09-15'
-- GROUP BY date_fact
-- ORDER BY total_min DESC;
