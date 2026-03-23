-- Миграция: добавление таблиц групп (учитель–группа–ученик)

BEGIN;

-- 1) groups
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP
);

COMMENT ON TABLE groups IS 'Группы учеников (Teacher–Group–Student)';
COMMENT ON COLUMN groups.title IS 'Название группы';
COMMENT ON COLUMN groups.description IS 'Описание группы';
COMMENT ON COLUMN groups.archived_at IS 'Мягкое архивирование группы';

CREATE INDEX IF NOT EXISTS idx_groups_archived_at ON groups(archived_at);

-- 2) group_teachers
CREATE TABLE IF NOT EXISTS group_teachers (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    teacher_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'owner',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, teacher_user_id)
);

COMMENT ON TABLE group_teachers IS 'Связь учителей с группами';
COMMENT ON COLUMN group_teachers.role IS 'Роль в группе: owner/co_teacher';

CREATE INDEX IF NOT EXISTS idx_group_teachers_teacher ON group_teachers(teacher_user_id);

-- 3) group_students
CREATE TABLE IF NOT EXISTS group_students (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMP,
    PRIMARY KEY (group_id, student_user_id)
);

COMMENT ON TABLE group_students IS 'Связь учеников с группами';
COMMENT ON COLUMN group_students.status IS 'Статус участия: active/pending/removed';

CREATE INDEX IF NOT EXISTS idx_group_students_student ON group_students(student_user_id);
CREATE INDEX IF NOT EXISTS idx_group_students_status ON group_students(status);

-- 4) group_invites
CREATE TABLE IF NOT EXISTS group_invites (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by_teacher_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    mode VARCHAR(20) NOT NULL DEFAULT 'link',
    expires_at TIMESTAMP,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP
);

COMMENT ON TABLE group_invites IS 'Инвайты в группу (в т.ч. multi-use ссылки)';
COMMENT ON COLUMN group_invites.token IS 'Токен инвайта (используется в /join-group/<token>)';
COMMENT ON COLUMN group_invites.mode IS 'Тип инвайта: link/direct';
COMMENT ON COLUMN group_invites.max_uses IS 'Лимит использований (NULL = без лимита)';
COMMENT ON COLUMN group_invites.revoked_at IS 'Если заполнено — инвайт отозван';

CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);

COMMIT;
