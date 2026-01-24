"""add_author_materials_url_to_books

Revision ID: f5678901234e
Revises: e4567890123d
Create Date: 2025-12-17 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f5678901234e'
down_revision = 'e4567890123d'
branch_labels = None
depends_on = None


def upgrade():
    # Получаем соединение для проверки существования колонки
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Добавляем author_materials_url в таблицу books
    books_columns = [col['name'] for col in inspector.get_columns('books')]
    if 'author_materials_url' not in books_columns:
        op.add_column('books', sa.Column('author_materials_url', sa.String(length=500), nullable=True))


def downgrade():
    # Удаляем author_materials_url из books
    op.drop_column('books', 'author_materials_url')

