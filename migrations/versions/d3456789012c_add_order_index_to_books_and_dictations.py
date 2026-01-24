"""add_order_index_to_books_and_dictations

Revision ID: d3456789012c
Revises: c2345678901b
Create Date: 2025-12-17 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3456789012c'
down_revision = 'c2345678901b'
branch_labels = None
depends_on = None


def upgrade():
    # Получаем соединение для проверки существования колонок
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Добавляем order_index в таблицу books (для сортировки разделов)
    books_columns = [col['name'] for col in inspector.get_columns('books')]
    if 'order_index' not in books_columns:
        op.add_column('books', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))
        op.create_index(op.f('ix_books_order_index'), 'books', ['order_index'], unique=False)
    
    # Добавляем order_index в таблицу book_dictations (для сортировки диктантов)
    book_dictations_columns = [col['name'] for col in inspector.get_columns('book_dictations')]
    if 'order_index' not in book_dictations_columns:
        op.add_column('book_dictations', sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'))
        op.create_index(op.f('ix_book_dictations_order_index'), 'book_dictations', ['order_index'], unique=False)


def downgrade():
    # Удаляем order_index из book_dictations
    op.drop_index(op.f('ix_book_dictations_order_index'), table_name='book_dictations')
    op.drop_column('book_dictations', 'order_index')
    
    # Удаляем order_index из books
    op.drop_index(op.f('ix_books_order_index'), table_name='books')
    op.drop_column('books', 'order_index')

