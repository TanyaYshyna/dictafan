"""add_position_to_dictation_sentences

Revision ID: j9012345678i
Revises: i8901234567h
Create Date: 2026-03-04 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "j9012345678i"
down_revision: Union[str, None] = "i8901234567h"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Add column (nullable for safe rollout)
    op.add_column('dictation_sentences', sa.Column('position', sa.Integer(), nullable=True))

    # 2) Backfill: set position per (dictation_id, language_code)
    # Numeric sentence_key first (000..), then non-numeric (e.g. t_001).
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY dictation_id, language_code
                    ORDER BY
                        CASE
                            WHEN sentence_key ~ '^[0-9]+$' THEN sentence_key::int
                            ELSE 1000000000
                        END,
                        sentence_key
                ) AS rn
            FROM dictation_sentences
        )
        UPDATE dictation_sentences ds
        SET position = ranked.rn
        FROM ranked
        WHERE ds.id = ranked.id;
        """
    )

    # 3) Index for fast ordering
    op.create_index(
        'idx_dictation_sentences_dictation_lang_position',
        'dictation_sentences',
        ['dictation_id', 'language_code', 'position'],
    )


def downgrade() -> None:
    op.drop_index('idx_dictation_sentences_dictation_lang_position', table_name='dictation_sentences')
    op.drop_column('dictation_sentences', 'position')
