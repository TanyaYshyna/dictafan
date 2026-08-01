-- Миграция: создание системы ролей, разрешений и лицензий
-- Делает всё одной командой:
--   \i migrations/add_roles_permissions_license_system.sql
--
-- 1. Создаёт таблицы
-- 2. Заполняет справочники (роли, разрешения, связи)
-- 3. Выдаёт лицензию StudentTeacher30 (админ) всем существующим пользователям
-- 4. Заполняет календарь доступа на 10 лет вперёд

BEGIN;

-- ============================================================
-- ТАБЛИЦЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    number INTEGER,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS license_operations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id TEXT,
    license_type TEXT NOT NULL,
    date_begin DATE NOT NULL,
    days INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_license_operations_user_id ON license_operations(user_id);

CREATE TABLE IF NOT EXISTS user_access_calendar (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    source_document_type TEXT NOT NULL,
    source_document_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_access_calendar_user_date ON user_access_calendar(user_id, date);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);

-- ============================================================
-- СПРАВОЧНИКИ: РОЛИ
-- ============================================================

INSERT INTO roles (code, name) VALUES
    ('guest',   'Guest'),
    ('student', 'Student'),
    ('teacher', 'Teacher'),
    ('admin',   'Admin')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- СПРАВОЧНИКИ: РАЗРЕШЕНИЯ
-- ============================================================

INSERT INTO permissions (code, name) VALUES
    ('available_characters_per_day',        'Количество символов в день'),
    ('audio_recordings_available_per_day',  'Количество аудиозаписей в день'),
    ('number_of_new_sentences_per_day',     'Количество новых предложений в день'),
    ('open_admin_report',                   'Открытие админ-отчёта'),
    ('create_exercise',                     'Создание упражнений'),
    ('delete_exercise',                     'Удаление упражнений'),
    ('view_statistics',                     'Просмотр статистики'),
    ('manage_students',                     'Управление студентами'),
    ('create_dictation',                    'Создание диктанта'),
    ('edit_dictation',                      'Редактирование диктанта'),
    ('access_desktop',                      'Доступ к десктопу')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- СПРАВОЧНИКИ: СВЯЗИ РОЛЬ-РАЗРЕШЕНИЕ
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id, number) VALUES

    -- Guest
    ((SELECT id FROM roles WHERE code = 'guest'), (SELECT id FROM permissions WHERE code = 'available_characters_per_day'),        1000),
    ((SELECT id FROM roles WHERE code = 'guest'), (SELECT id FROM permissions WHERE code = 'audio_recordings_available_per_day'),  20),
    ((SELECT id FROM roles WHERE code = 'guest'), (SELECT id FROM permissions WHERE code = 'access_desktop'),                      NULL),

    -- Student
    ((SELECT id FROM roles WHERE code = 'student'), (SELECT id FROM permissions WHERE code = 'available_characters_per_day'),        -1),
    ((SELECT id FROM roles WHERE code = 'student'), (SELECT id FROM permissions WHERE code = 'audio_recordings_available_per_day'),  -1),
    ((SELECT id FROM roles WHERE code = 'student'), (SELECT id FROM permissions WHERE code = 'access_desktop'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'student'), (SELECT id FROM permissions WHERE code = 'create_dictation'),                    NULL),
    ((SELECT id FROM roles WHERE code = 'student'), (SELECT id FROM permissions WHERE code = 'edit_dictation'),                      NULL),

    -- Teacher
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'available_characters_per_day'),         -1),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'audio_recordings_available_per_day'),   -1),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'number_of_new_sentences_per_day'),      50),
    ((SELECT id FROM roles WHERE CODE = 'teacher'), (SELECT id FROM permissions WHERE code = 'access_desktop'),                       NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'create_exercise'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'delete_exercise'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'view_statistics'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'manage_students'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'create_dictation'),                     NULL),
    ((SELECT id FROM roles WHERE code = 'teacher'), (SELECT id FROM permissions WHERE code = 'edit_dictation'),                       NULL),

    -- Admin
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'available_characters_per_day'),          -1),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'audio_recordings_available_per_day'),    -1),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'number_of_new_sentences_per_day'),       -1),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'open_admin_report'),                     NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'create_exercise'),                       NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'delete_exercise'),                       NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'view_statistics'),                       NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'manage_students'),                       NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'create_dictation'),                      NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'edit_dictation'),                        NULL),
    ((SELECT id FROM roles WHERE code = 'admin'), (SELECT id FROM permissions WHERE code = 'access_desktop'),                        NULL)

ON CONFLICT (role_id, permission_id) DO UPDATE SET number = EXCLUDED.number;

-- ============================================================
-- ВЫДАЧА АДМИН-ДОСТУПА ВСЕМ СУЩЕСТВУЮЩИМ ПОЛЬЗОВАТЕЛЯМ
-- ============================================================

-- 1. Устанавливаем role_id = admin всем существующим пользователям
UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'admin')
WHERE role_id IS NULL;

-- 2. Создаём запись в license_operations для каждого пользователя,
--    у которого ещё нет ни одной лицензии
INSERT INTO license_operations (user_id, document_type, license_type, date_begin, days, priority, comment)
SELECT
    u.id,
    'manual',
    'StudentTeacher30',
    CURRENT_DATE,
    0,   -- 0 = навсегда
    30,  -- максимальный приоритет
    'Автоматическая выдача при миграции — права администратора'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM license_operations lo WHERE lo.user_id = u.id
);

-- 3. Заполняем календарь доступа на 10 лет вперёд с ролью admin
INSERT INTO user_access_calendar (user_id, date, role_id, source_document_type, source_document_id)
SELECT
    u.id,
    d::date,
    (SELECT id FROM roles WHERE code = 'admin'),
    'manual',
    NULL
FROM users u
CROSS JOIN generate_series(
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '10 years',
    '1 day'::interval
) AS d
WHERE NOT EXISTS (
    SELECT 1 FROM user_access_calendar uac
    WHERE uac.user_id = u.id AND uac.date = d::date
);

COMMIT;
