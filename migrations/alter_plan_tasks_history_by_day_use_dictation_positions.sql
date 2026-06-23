-- Миграция: plan_tasks и history_by_day переходят с exercise_id на (dictation_id, positions)

BEGIN;

-- 1) plan_tasks
ALTER TABLE plan_tasks
    ADD COLUMN IF NOT EXISTS dictation_id INTEGER,
    ADD COLUMN IF NOT EXISTS positions INTEGER[] NOT NULL DEFAULT '{}';

UPDATE plan_tasks pt
SET dictation_id = de.dictation_id,
    positions = de.positions
FROM dictation_exercises de
WHERE pt.exercise_id = de.id
  AND pt.dictation_id IS NULL;

ALTER TABLE plan_tasks
    ALTER COLUMN dictation_id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_plan_tasks_groups_exercise_date'
          AND table_name = 'plan_tasks'
    ) THEN
        ALTER TABLE plan_tasks DROP CONSTRAINT uq_plan_tasks_groups_exercise_date;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_plan_tasks_exercise_id;

ALTER TABLE plan_tasks
    DROP COLUMN IF EXISTS exercise_id;

ALTER TABLE plan_tasks
    ADD CONSTRAINT uq_plan_tasks_groups_dictation_positions_date UNIQUE (groups_id, dictation_id, positions, date_plan);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_groups_date ON plan_tasks(groups_id, date_plan);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_dictation_id ON plan_tasks(dictation_id);

-- 2) history_by_day
ALTER TABLE history_by_day
    ADD COLUMN IF NOT EXISTS dictation_id INTEGER,
    ADD COLUMN IF NOT EXISTS positions INTEGER[] NOT NULL DEFAULT '{}';

UPDATE history_by_day hbd
SET dictation_id = de.dictation_id,
    positions = de.positions
FROM dictation_exercises de
WHERE hbd.exercise_id = de.id
  AND hbd.dictation_id IS NULL;

ALTER TABLE history_by_day
    ALTER COLUMN dictation_id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_history_by_day'
          AND table_name = 'history_by_day'
    ) THEN
        ALTER TABLE history_by_day DROP CONSTRAINT uq_history_by_day;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_history_by_day_exercise_date_fact;

ALTER TABLE history_by_day
    DROP COLUMN IF EXISTS exercise_id;

ALTER TABLE history_by_day
    ADD CONSTRAINT uq_history_by_day UNIQUE (user_id, teacher_id, dictation_id, positions, date_plan, date_fact);

CREATE INDEX IF NOT EXISTS idx_history_by_day_user_date_fact ON history_by_day(user_id, date_fact);
CREATE INDEX IF NOT EXISTS idx_history_by_day_teacher_date_fact ON history_by_day(teacher_id, date_fact);
CREATE INDEX IF NOT EXISTS idx_history_by_day_dictation_date_fact ON history_by_day(dictation_id, date_fact);

-- 3) history_successes: сохраняем дату старта полного диктанта
ALTER TABLE history_successes
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_history_successes_started_at ON history_successes(started_at);

COMMIT;
