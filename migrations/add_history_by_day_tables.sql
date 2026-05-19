-- Миграция: добавляем новую модель истории (упражнения + план + дневная история)

BEGIN;

-- 1) Упражнения диктанта
CREATE TABLE IF NOT EXISTS dictation_exercises (
    id SERIAL PRIMARY KEY,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    positions INTEGER[] NOT NULL DEFAULT '{}',
    title TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dictation_exercises_dictation_positions UNIQUE (dictation_id, positions)
);

CREATE INDEX IF NOT EXISTS idx_dictation_exercises_dictation_id ON dictation_exercises(dictation_id);

-- 2) План задач (календарные задания)
CREATE TABLE IF NOT EXISTS plan_tasks (
    id SERIAL PRIMARY KEY,
    groups_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES dictation_exercises(id) ON DELETE CASCADE,
    date_plan DATE NOT NULL,
    repeat_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plan_tasks_groups_exercise_date UNIQUE (groups_id, exercise_id, date_plan)
);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_groups_date ON plan_tasks(groups_id, date_plan);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_exercise_id ON plan_tasks(exercise_id);

-- 3) Дневная история
CREATE TABLE IF NOT EXISTS history_by_day (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    dictation_language_code TEXT,
    exercise_id INTEGER NOT NULL REFERENCES dictation_exercises(id) ON DELETE CASCADE,
    date_plan DATE NOT NULL,
    date_fact DATE NOT NULL,
    perfect_count INTEGER NOT NULL DEFAULT 0,
    corrected_count INTEGER NOT NULL DEFAULT 0,
    audio_count INTEGER NOT NULL DEFAULT 0,
    lead_time BIGINT NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_history_by_day UNIQUE (user_id, teacher_id, exercise_id, date_plan, date_fact)
);

CREATE INDEX IF NOT EXISTS idx_history_by_day_user_date_fact ON history_by_day(user_id, date_fact);
CREATE INDEX IF NOT EXISTS idx_history_by_day_teacher_date_fact ON history_by_day(teacher_id, date_fact);
CREATE INDEX IF NOT EXISTS idx_history_by_day_exercise_date_fact ON history_by_day(exercise_id, date_fact);

COMMIT;
