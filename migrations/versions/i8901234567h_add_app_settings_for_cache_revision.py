"""add_app_settings_for_cache_revision

Revision ID: i8901234567h
Revises: h7890123456g
Create Date: 2026-02-23 06:49:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "i8901234567h"
down_revision: Union[str, None] = "h7890123456g"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """
    )

    # Seed the cache revision key if missing
    op.execute(
        """
        INSERT INTO app_settings (key, value)
        SELECT 'app_cache_revision', '1'
        WHERE NOT EXISTS (
            SELECT 1 FROM app_settings WHERE key = 'app_cache_revision'
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_settings")
