"""add_books_and_desk_tables

Revision ID: b1234567890a
Revises: a1b2c3d4e5f6
Create Date: 2025-12-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1234567890a"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Таблица книг
    op.create_table(
        "books",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False, comment="Название книги"),
        sa.Column(
            "cover_url",
            sa.String(500),
            nullable=True,
            comment="Обложка/ковер книги (URL)",
        ),
        sa.Column(
            "author_text",
            sa.String(255),
            nullable=True,
            comment="Автор текста (необязательно)",
        ),
        sa.Column(
            "creator_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="Создатель книги в системе (user)",
        ),
        sa.Column(
            "original_language",
            sa.String(10),
            sa.ForeignKey("languages.code"),
            nullable=True,
            comment="Язык оригинала книги",
        ),
        sa.Column(
            "visibility",
            sa.String(50),
            nullable=False,
            server_default="private",
            comment="Статус видимости книги: public/private/...",
        ),
        sa.Column(
            "short_description",
            sa.Text(),
            nullable=True,
            comment="Краткое описание книги",
        ),
        sa.Column(
            "theme",
            sa.String(100),
            nullable=True,
            comment="Тема книги (строка, справочник можно добавить позже)",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            comment="Дата создания книги",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            comment="Дата обновления книги",
        ),
    )

    # Справочник категорий книг
    op.create_table(
        "book_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "code",
            sa.String(50),
            nullable=False,
            unique=True,
            comment="Код категории (children, poem и т.п.)",
        ),
        sa.Column(
            "title",
            sa.String(100),
            nullable=False,
            comment="Название категории",
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
            comment="Описание категории",
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Порядок сортировки категорий",
        ),
    )

    # Связь многие-ко-многим книга–категория
    op.create_table(
        "book_category_links",
        sa.Column(
            "book_id",
            sa.Integer(),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("book_categories.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # Связь книга–диктант
    op.create_table(
        "book_dictations",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "book_id",
            sa.Integer(),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
            comment="ID книги",
        ),
        sa.Column(
            "dictation_id",
            sa.Integer(),
            sa.ForeignKey("dictations.id", ondelete="CASCADE"),
            nullable=False,
            comment="ID диктанта",
        ),
        sa.Column(
            "order_index",
            sa.Integer(),
            nullable=True,
            comment="Порядок диктанта в книге",
        ),
    )
    op.create_index(
        "idx_book_dictations_book",
        "book_dictations",
        ["book_id"],
    )
    op.create_index(
        "idx_book_dictations_dictation",
        "book_dictations",
        ["dictation_id"],
    )

    # Таблица «книги на полке пользователя» (приватная библиотека)
    op.create_table(
        "user_books",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            comment="Пользователь, у которого книга на полке",
        ),
        sa.Column(
            "book_id",
            sa.Integer(),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
            comment="Книга на полке пользователя",
        ),
        sa.Column(
            "is_owner_copy",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Является ли это собственной книгой пользователя",
        ),
        sa.Column(
            "is_derived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Книга создана на основе чужой (под редакцией)",
        ),
        sa.Column(
            "editor_note",
            sa.String(255),
            nullable=True,
            comment='Текст вроде "Книга пользователя X под редакцией Y"',
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            comment="Когда книга была добавлена на полку",
        ),
    )
    op.create_unique_constraint(
        "uq_user_books_user_book",
        "user_books",
        ["user_id", "book_id"],
    )

    # Таблица «Стол с диктантами» (диктанты в работе)
    op.create_table(
        "desk_items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            comment="Пользователь, у которого диктант на столе",
        ),
        sa.Column(
            "dictation_id",
            sa.Integer(),
            sa.ForeignKey("dictations.id", ondelete="CASCADE"),
            nullable=False,
            comment="ID диктанта на столе",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            comment="Когда диктант был положен на стол",
        ),
        sa.Column(
            "planned_date",
            sa.Date(),
            nullable=True,
            comment="Планируемая дата работы с диктантом (на будущее)",
        ),
    )
    op.create_unique_constraint(
        "uq_desk_items_user_dictation",
        "desk_items",
        ["user_id", "dictation_id"],
    )
    op.create_index(
        "idx_desk_items_user",
        "desk_items",
        ["user_id"],
    )
    op.create_index(
        "idx_desk_items_planned_date",
        "desk_items",
        ["planned_date"],
    )


def downgrade() -> None:
    # Откат в обратном порядке из-за внешних ключей
    op.drop_index("idx_desk_items_planned_date", table_name="desk_items")
    op.drop_index("idx_desk_items_user", table_name="desk_items")
    op.drop_constraint("uq_desk_items_user_dictation", "desk_items", type_="unique")
    op.drop_table("desk_items")

    op.drop_constraint("uq_user_books_user_book", "user_books", type_="unique")
    op.drop_table("user_books")

    op.drop_index("idx_book_dictations_dictation", table_name="book_dictations")
    op.drop_index("idx_book_dictations_book", table_name="book_dictations")
    op.drop_table("book_dictations")

    op.drop_table("book_category_links")
    op.drop_table("book_categories")
    op.drop_table("books")


