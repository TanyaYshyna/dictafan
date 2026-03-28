"""ensure_default_workbook_for_users

Revision ID: k0123456789j
Revises: j9012345678i
Create Date: 2026-03-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "k0123456789j"
down_revision: Union[str, None] = "j9012345678i"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("users") or not inspector.has_table("books"):
        return

    book_cols = {c["name"] for c in inspector.get_columns("books")}

    cols = ["creator_user_id", "title"]
    select_parts = ["u.id", "'Рабочая тетрадь'"]

    if "visibility" in book_cols:
        cols.append("visibility")
        select_parts.append("'private'")

    if "short_description" in book_cols:
        cols.append("short_description")
        select_parts.append("'Диктанты без книги'")

    if "order_index" in book_cols:
        cols.append("order_index")
        select_parts.append("-1")

    if "created_at" in book_cols:
        cols.append("created_at")
        select_parts.append("CURRENT_TIMESTAMP")

    if "updated_at" in book_cols:
        cols.append("updated_at")
        select_parts.append("CURRENT_TIMESTAMP")

    insert_sql = f"""
        INSERT INTO books ({', '.join(cols)})
        SELECT {', '.join(select_parts)}
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1
            FROM books b
            WHERE b.creator_user_id = u.id
              AND b.title = 'Рабочая тетрадь'
        );
    """
    op.execute(insert_sql)

    if inspector.has_table("user_books"):
        ub_cols = {c["name"] for c in inspector.get_columns("user_books")}
        ub_insert_cols = ["user_id", "book_id"]
        ub_select_parts = ["b.creator_user_id", "b.id"]

        if "is_owner_copy" in ub_cols:
            ub_insert_cols.append("is_owner_copy")
            ub_select_parts.append("true")

        if "is_derived" in ub_cols:
            ub_insert_cols.append("is_derived")
            ub_select_parts.append("false")

        if "created_at" in ub_cols:
            ub_insert_cols.append("created_at")
            ub_select_parts.append("CURRENT_TIMESTAMP")

        ub_sql = f"""
            INSERT INTO user_books ({', '.join(ub_insert_cols)})
            SELECT {', '.join(ub_select_parts)}
            FROM books b
            WHERE b.title = 'Рабочая тетрадь'
              AND b.creator_user_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM user_books ub
                  WHERE ub.user_id = b.creator_user_id
                    AND ub.book_id = b.id
              );
        """
        op.execute(ub_sql)


def downgrade() -> None:
    # Do not delete user workbooks on downgrade.
    return
