"""add_title_translations

Revision ID: cd02267e
Revises: 0e9c88803c8a
Create Date: 2025-12-05 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cd02267e'
down_revision: Union[str, None] = '0e9c88803c8a'  # ID предыдущей миграции
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле title_translations_json в таблицу dictations
    op.add_column('dictations', 
        sa.Column('title_translations_json', sa.Text(), nullable=True,
                  comment='JSON объект с переводами заголовка на разные языки. Формат: {"en": "Title", "ru": "Заголовок", "uk": "Заголовок"}')
    )


def downgrade() -> None:
    # Удаляем поле при откате миграции
    op.drop_column('dictations', 'title_translations_json')

