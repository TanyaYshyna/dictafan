BEGIN;

-- 1) books.root_book_id: denormalized pointer to the top-level book
ALTER TABLE books
ADD COLUMN IF NOT EXISTS root_book_id INTEGER;

-- Fill root_book_id for all existing books/sections.
-- Assumption: top-level books have parent_id IS NULL.
WITH RECURSIVE book_tree AS (
    SELECT
        b.id,
        b.id AS root_id
    FROM books b
    WHERE b.parent_id IS NULL

    UNION ALL

    SELECT
        c.id,
        bt.root_id
    FROM books c
    JOIN book_tree bt ON bt.id = c.parent_id
)
UPDATE books b
SET root_book_id = bt.root_id
FROM book_tree bt
WHERE b.id = bt.id;

-- Ensure no NULLs remain (defensive): if something was missed, set to self.
UPDATE books
SET root_book_id = id
WHERE root_book_id IS NULL;

ALTER TABLE books
ALTER COLUMN root_book_id SET NOT NULL;

-- Optional FK (kept without ON DELETE CASCADE to avoid accidental mass deletes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'books_root_book_id_fk'
    ) THEN
        ALTER TABLE books
        ADD CONSTRAINT books_root_book_id_fk
        FOREIGN KEY (root_book_id) REFERENCES books(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_books_root_book_id
ON books(root_book_id);


-- 2) books.is_workbook: explicit flag, do not overload order_index
ALTER TABLE books
ADD COLUMN IF NOT EXISTS is_workbook BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing workbooks.
UPDATE books
SET is_workbook = TRUE
WHERE title = 'Рабочая тетрадь'
  AND parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_creator_is_workbook
ON books(creator_user_id, is_workbook);


-- 2.1) Safety: attach any hanging dictations (no book_dictations row) to workbook of user_id=2
-- Assumption: user with id=2 exists.
DO $$
DECLARE
    v_workbook_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = 2) THEN
        RAISE EXCEPTION 'User with id=2 does not exist';
    END IF;

    SELECT b.id
    INTO v_workbook_id
    FROM books b
    WHERE b.creator_user_id = 2
      AND b.is_workbook = TRUE
      AND b.parent_id IS NULL
    ORDER BY b.id ASC
    LIMIT 1;

    IF v_workbook_id IS NULL THEN
        RAISE EXCEPTION 'Workbook for user id=2 not found (books.is_workbook=true)';
    END IF;

    INSERT INTO book_dictations (book_id, dictation_id, order_index)
    SELECT
        v_workbook_id,
        d.id,
        0
    FROM dictations d
    WHERE NOT EXISTS (
        SELECT 1
        FROM book_dictations bd
        WHERE bd.dictation_id = d.id
    );
END $$;


-- 3) Enforce: exactly one book_dictations row per dictation_id
-- First, drop duplicates deterministically (keep minimal id)
DELETE FROM book_dictations bd
USING book_dictations bd2
WHERE bd.dictation_id = bd2.dictation_id
  AND bd.id > bd2.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_book_dictations_dictation_id
ON book_dictations(dictation_id);

COMMIT;
