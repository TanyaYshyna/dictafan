-- Миграция: фиксируем модель "один учитель на группу" через groups.teacher_id

BEGIN;

-- 1) Добавляем teacher_id в groups
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;

-- 2) Заполняем teacher_id из group_teachers (owner -> первый попавшийся)
-- Если в группе несколько учителей, берём owner если есть, иначе минимальный teacher_user_id.
UPDATE groups g
SET teacher_id = src.teacher_user_id
FROM (
    SELECT
        gt.group_id,
        (ARRAY_AGG(gt.teacher_user_id ORDER BY (gt.role = 'owner') DESC, gt.teacher_user_id ASC))[1] AS teacher_user_id
    FROM group_teachers gt
    GROUP BY gt.group_id
) src
WHERE g.id = src.group_id
  AND g.teacher_id IS NULL;

-- 3) Для personal groups (если есть колонка personal_owner_user_id) teacher_id = personal_owner_user_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='groups' AND column_name='personal_owner_user_id'
    ) THEN
        EXECUTE '
            UPDATE groups
            SET teacher_id = personal_owner_user_id
            WHERE teacher_id IS NULL AND personal_owner_user_id IS NOT NULL
        ';
    END IF;
END $$;

-- 4) Делаем teacher_id обязательным там, где это возможно
-- (Если где-то остались группы без teacher_id, миграция не упадёт — их нужно будет поправить вручную.)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM groups WHERE teacher_id IS NULL) THEN
        ALTER TABLE groups ALTER COLUMN teacher_id SET NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_groups_teacher_id ON groups(teacher_id);

COMMIT;
