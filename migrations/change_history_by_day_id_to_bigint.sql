-- Миграция: сменить тип id с SERIAL (INTEGER) на BIGSERIAL (BIGINT)
-- и добавить составной индекс для ускорения UPSERT.

-- 1) Меняем тип колонки id с INTEGER на BIGINT
--    PostgreSQL автоматически обновит sequence.
ALTER TABLE history_by_day
    ALTER COLUMN id TYPE BIGINT;

-- 2) Добавляем составной индекс по полям уникальности для ускорения
--    INSERT ... ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)
--    Без этого индекса PostgreSQL при каждом UPSERT сканирует таблицу в поиске конфликта.
--    Индекс уже существует как CONSTRAINT (uq_history_by_day), но явный индекс
--    на те же поля может ускорить поиск при больших объёмах данных.
--
--    PostgreSQL автоматически создаёт индекс для UNIQUE-constraint,
--    так что дополнительный индекс не требуется.
--    Но для ускорения запросов вида WHERE user_id=? AND date_fact BETWEEN ? AND ?
--    уже есть индекс idx_history_by_day_user_date_fact.
--
--    Добавляем индекс на (dictation_id, positions) для ускорения агрегации
--    по диктанту (используется в planfact и rating отчётах).
CREATE INDEX IF NOT EXISTS idx_history_by_day_dictation_positions
    ON history_by_day(dictation_id, positions);
