"""add_author_materials_url_to_dictations

Revision ID: g6789012345f
Revises: f5678901234e
Create Date: 2025-01-20 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g6789012345f'
down_revision: Union[str, None] = 'f5678901234e'  # ID предыдущей миграции
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Получаем соединение для проверки существования колонки
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Добавляем author_materials_url в таблицу dictations
    dictations_columns = [col['name'] for col in inspector.get_columns('dictations')]
    if 'author_materials_url' not in dictations_columns:
        op.add_column('dictations', 
            sa.Column('author_materials_url', sa.String(length=500), nullable=True,
                     comment='URL на материалы автора (ссылка на внешний ресурс)')
        )


def downgrade() -> None:
    # Удаляем author_materials_url из dictations
    op.drop_column('dictations', 'author_materials_url')

