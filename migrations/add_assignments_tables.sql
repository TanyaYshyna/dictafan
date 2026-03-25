-- Миграция: добавление таблиц заданий (Assignments)

BEGIN;

-- 1) assignments
CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    created_by_teacher_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Для периода: [start_date, end_date]
    -- Для плана по дням: day_date записываем в оба поля start_date/end_date
    start_date DATE,
    end_date DATE,
    required_completions INTEGER,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP
);

COMMENT ON TABLE assignments IS 'Задания учителя на диктанты для группы';
COMMENT ON COLUMN assignments.start_date IS 'Дата начала периода; для плана по дням совпадает с end_date';
COMMENT ON COLUMN assignments.end_date IS 'Дата конца периода; для плана по дням совпадает со start_date';
COMMENT ON COLUMN assignments.required_completions IS 'Сколько раз нужно выполнить в рамках периода или в конкретную дату (если start_date=end_date)';
COMMENT ON COLUMN assignments.archived_at IS 'Мягкое архивирование задания';

CREATE INDEX IF NOT EXISTS idx_assignments_group_id ON assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dictation_id ON assignments(dictation_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON assignments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_assignments_archived_at ON assignments(archived_at);

COMMIT;
