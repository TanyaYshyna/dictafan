-- Миграция: личные группы (план для себя) + self telegram reports

BEGIN;

-- groups: личные группы
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE groups
ADD COLUMN IF NOT EXISTS personal_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groups_is_personal ON groups(is_personal);
CREATE INDEX IF NOT EXISTS idx_groups_personal_owner_user_id ON groups(personal_owner_user_id);

-- users: self telegram reports (слать отчеты себе)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_self_reports_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: создать личную группу для каждого пользователя, если ее нет
CREATE TEMP TABLE tmp_created_personal_groups (
    group_id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL
) ON COMMIT DROP;

WITH to_create AS (
    SELECT u.id AS user_id, u.username AS username
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1
        FROM groups g
        WHERE g.is_personal = TRUE
          AND g.personal_owner_user_id = u.id
    )
), created_groups AS (
    INSERT INTO groups (
        title,
        description,
        is_personal,
        personal_owner_user_id,
        created_at,
        updated_at,
        archived_at
    )
    SELECT
        tc.username,
        'Личный план',
        TRUE,
        tc.user_id,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL
    FROM to_create tc
    RETURNING id, personal_owner_user_id
)
INSERT INTO tmp_created_personal_groups (group_id, owner_user_id)
SELECT cg.id, cg.personal_owner_user_id
FROM created_groups cg;

INSERT INTO group_teachers (group_id, teacher_user_id, role)
SELECT t.group_id, t.owner_user_id, 'owner'
FROM tmp_created_personal_groups t
ON CONFLICT DO NOTHING;

INSERT INTO group_students (group_id, student_user_id, status, joined_at, removed_at)
SELECT t.group_id, t.owner_user_id, 'active', CURRENT_TIMESTAMP, NULL
FROM tmp_created_personal_groups t
ON CONFLICT (group_id, student_user_id)
DO UPDATE SET status='active', removed_at=NULL, joined_at=CURRENT_TIMESTAMP;

-- В личной группе: всегда запрещаем уведомления учителю
UPDATE group_students gs
SET notify_teacher_on_success = FALSE
FROM groups g
WHERE g.id = gs.group_id
  AND g.is_personal = TRUE
  AND g.personal_owner_user_id = gs.student_user_id;

COMMIT;
