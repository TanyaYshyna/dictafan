-- Миграция: отключить задания "на период" и оставить только "по дням"
-- Стратегия:
-- 1) Все активные задания с start_date <> end_date (period) переводим в архив.
-- 2) Добавляем CHECK constraint, который запрещает создание/редактирование period-заданий среди НЕархивных.
--
-- Важно: constraint допускает period-строки только если archived_at IS NOT NULL,
-- чтобы не ломать исторические данные.

BEGIN;

-- 1) Удаляем все period-задания (start_date <> end_date)
DELETE FROM assignments
WHERE start_date IS NOT NULL
  AND end_date IS NOT NULL
  AND start_date <> end_date;

-- 2) Запрещаем period-задания для НЕархивных строк
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS chk_assignments_day_only_for_active;

ALTER TABLE assignments
  ADD CONSTRAINT chk_assignments_day_only_for_active
  CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR start_date = end_date
  );

COMMIT;
