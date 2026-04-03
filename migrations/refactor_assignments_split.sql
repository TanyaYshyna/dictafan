BEGIN;

DROP TABLE IF EXISTS assignments CASCADE;

CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    created_by_teacher_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    selected_sentence_positions int[],
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignments_group_id ON assignments(group_id);
CREATE INDEX idx_assignments_dictation_id ON assignments(dictation_id);

CREATE TABLE assignments_by_date (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    required_completions INTEGER NOT NULL CHECK (required_completions > 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (assignment_id, day_date)
);

CREATE INDEX idx_assignments_by_date_assignment_id ON assignments_by_date(assignment_id);
CREATE INDEX idx_assignments_by_date_day_date ON assignments_by_date(day_date);
CREATE INDEX idx_assignments_by_date_assignment_day ON assignments_by_date(assignment_id, day_date);

COMMIT;
