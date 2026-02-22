"""drop_unclosed_dictations_tables

Revision ID: h7890123456g
Revises: g6789012345f
Create Date: 2026-02-21 22:30:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "h7890123456g"
down_revision: Union[str, None] = "g6789012345f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drafts/resume state are now stored client-side in IndexedDB.
    # Remove server-side unclosed dictation tables if they exist.
    op.execute("DROP TABLE IF EXISTS history_unclosed_dictations_sentences")
    op.execute("DROP TABLE IF EXISTS history_unclosed_dictations")


def downgrade() -> None:
    # Intentionally no-op: we don't recreate removed tables.
    pass
