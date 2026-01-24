"""remove_avatar_urls_from_users

Revision ID: 0e9c88803c8a
Revises: 55fecf84b31a
Create Date: 2025-12-04 18:06:13.800597

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e9c88803c8a'
down_revision: Union[str, None] = '55fecf84b31a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем колонки, связанные с аватарами - пути вычисляем по шаблону user_<id>
    op.drop_column('users', 'avatar_large_url')
    op.drop_column('users', 'avatar_small_url')
    op.drop_column('users', 'avatar_uploaded_at')


def downgrade() -> None:
    # Восстанавливаем колонки (на случай отката)
    op.add_column('users', sa.Column('avatar_large_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('avatar_small_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('avatar_uploaded_at', sa.DateTime(), nullable=True))
