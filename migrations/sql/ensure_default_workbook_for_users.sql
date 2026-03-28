-- ensure_default_workbook_for_users.sql
-- Creates a personal "Рабочая тетрадь" for every user (if missing) and adds it to the user's shelf.

BEGIN;

-- 1) Create workbook book per user (idempotent)
INSERT INTO books (creator_user_id, title, visibility, short_description, order_index, created_at, updated_at)
SELECT
  u.id,
  'Рабочая тетрадь',
  'private',
  'Диктанты без книги',
  -1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM books b
  WHERE b.creator_user_id = u.id
    AND b.title = 'Рабочая тетрадь'
);

-- 2) Put workbook on the owner's shelf (idempotent)
INSERT INTO user_books (user_id, book_id, is_owner_copy, is_derived, created_at)
SELECT
  b.creator_user_id,
  b.id,
  true,
  false,
  CURRENT_TIMESTAMP
FROM books b
WHERE b.title = 'Рабочая тетрадь'
  AND b.creator_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_books ub
    WHERE ub.user_id = b.creator_user_id
      AND ub.book_id = b.id
  );

COMMIT;
