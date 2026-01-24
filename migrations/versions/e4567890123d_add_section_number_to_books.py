"""add_section_number_to_books

Revision ID: e4567890123d
Revises: d3456789012c
Create Date: 2025-12-17 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4567890123d'
down_revision = 'd3456789012c'
branch_labels = None
depends_on = None


def upgrade():
    # Получаем соединение для проверки существования колонки
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Добавляем section_number в таблицу books (для нумерации разделов)
    books_columns = [col['name'] for col in inspector.get_columns('books')]
    if 'section_number' not in books_columns:
        op.add_column('books', sa.Column('section_number', sa.Integer(), nullable=True))
        op.create_index(op.f('ix_books_section_number'), 'books', ['section_number'], unique=False)


def downgrade():
    # Удаляем section_number из books
    op.drop_index(op.f('ix_books_section_number'), table_name='books')
    op.drop_column('books', 'section_number')


