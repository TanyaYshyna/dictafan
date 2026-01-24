"""add parent_id to books

Revision ID: c2345678901b
Revises: b1234567890a
Create Date: 2025-12-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2345678901b'
down_revision = 'b1234567890a'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем поле parent_id для создания иерархии глав/разделов
    op.add_column('books', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_books_parent_id',
        'books', 'books',
        ['parent_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # Добавляем индекс для быстрого поиска по parent_id
    op.create_index('ix_books_parent_id', 'books', ['parent_id'])


def downgrade():
    op.drop_index('ix_books_parent_id', table_name='books')
    op.drop_constraint('fk_books_parent_id', 'books', type_='foreignkey')
    op.drop_column('books', 'parent_id')

