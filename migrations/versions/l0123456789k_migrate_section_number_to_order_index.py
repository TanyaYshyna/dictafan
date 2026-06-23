"""migrate_section_number_to_order_index

Revision ID: l0123456789k
Revises: k0123456789j
Create Date: 2026-05-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "l0123456789k"
down_revision: Union[str, None] = "k0123456789j"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("books"):
        book_cols = {c["name"] for c in inspector.get_columns("books")}

        if "order_index" in book_cols and "section_number" in book_cols:
            op.execute(
                """
                UPDATE books
                SET order_index = section_number
                WHERE section_number IS NOT NULL
                ;
                """
            )

            op.drop_column("books", "section_number")

    if inspector.has_table("book_dictations"):
        bd_cols = {c["name"] for c in inspector.get_columns("book_dictations")}
        if "id" in bd_cols and "book_id" in bd_cols and "dictation_id" in bd_cols and "order_index" in bd_cols:
            op.execute(
                """
                WITH ranked AS (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY book_id
                            ORDER BY dictation_id ASC, id ASC
                        ) - 1 AS rn
                    FROM book_dictations
                )
                UPDATE book_dictations bd
                SET order_index = ranked.rn
                FROM ranked
                WHERE bd.id = ranked.id;
                """
            )

    if inspector.has_table("book_category_links"):
        op.drop_table("book_category_links")


def downgrade() -> None:
    # Intentionally no-op.
    return
