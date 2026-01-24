"""create_initial_tables

Revision ID: 55fecf84b31a
Revises: 
Create Date: 2025-12-03 23:08:25.312436

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55fecf84b31a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаём таблицу languages (справочник языков)
    op.create_table(
        'languages',
        sa.Column('code', sa.String(10), primary_key=True, comment='Код языка (en, uk, tr и т.д.)'),
        sa.Column('code_url', sa.String(10), nullable=True, unique=True, comment='Код языка (en-US, uk-UA, tr-TR и т.д.)'),
        sa.Column('name_native', sa.String(100), nullable=False, comment='Назва рідною мовою'),
        sa.Column('name_en', sa.String(100), nullable=False, comment='Назва англійською'),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True, comment='Активен ли язык'),
    )
    
    # Создаём таблицу users (пользователи)
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('username', sa.String(100), nullable=False, comment='Імʼя користоувача'),
        sa.Column('email', sa.String(255), nullable=False, unique=True, comment='Email користувача'),
        sa.Column('password_hash', sa.String(255), nullable=False, comment='Хеш паролю'),
        sa.Column('native_language', sa.String(10), sa.ForeignKey('languages.code'), nullable=True, comment='Рідна мова'),
        sa.Column('current_learning', sa.String(10), sa.ForeignKey('languages.code'), nullable=True, comment='Активна мова яку вивчає'),
        sa.Column('streak_days', sa.Integer(), nullable=False, default=0, comment='Кільківть діб безперевних занять'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Дата створення'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Дата оновленння'),
        sa.Column('avatar_large_url', sa.String(500), nullable=True, comment='URL великого аватара'),
        sa.Column('avatar_small_url', sa.String(500), nullable=True, comment='URL маленького аватара'),
        sa.Column('avatar_uploaded_at', sa.DateTime(), nullable=True, comment='Дата завантаження аватара'),
        sa.Column('role', sa.String(50), nullable=False, server_default='user', comment='Роль користувача (user, admin, user_pro і т.д.)'),
    )
    
    # Создаём таблицу user_learning_languages (языки, которые изучает пользователь)
    op.create_table(
        'user_learning_languages',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('language_code', sa.String(10), sa.ForeignKey('languages.code', ondelete='CASCADE'), primary_key=True),
    )
    
    # Создаём таблицу dictations (диктанты)
    op.create_table(
        'dictations',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('title', sa.String(255), nullable=False, comment='Название диктанта'),
        sa.Column('language_code', sa.String(10), sa.ForeignKey('languages.code'), nullable=False, comment='Язык диктанта'),
        sa.Column('level', sa.String(50), nullable=True, comment='Уровень сложности'),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True, comment='Владелец (для личных диктантов)'),
        sa.Column('is_public', sa.Boolean(), nullable=False, default=True, comment='Публичный диктант'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Дата создания'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Дата обновления'),
        sa.Column('audio_user_shared', sa.String(500), nullable=True, comment='URL общего аудио (если есть цельный аудио-файл диктанта)'),
        sa.Column('speakers_json', sa.Text(), nullable=True, comment='JSON со спикерами диктанта'),
    )
    
    # Создаём таблицу dictation_sentences (предложения диктанта)
    op.create_table(
        'dictation_sentences',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('dictation_id', sa.Integer(), sa.ForeignKey('dictations.id', ondelete='CASCADE'), nullable=False, comment='ID диктанта'),
        sa.Column('language_code', sa.String(10), sa.ForeignKey('languages.code'), nullable=False, comment='Язык предложения'),
        sa.Column('sentence_key', sa.String(50), nullable=False, comment='Ключ предложения (000, 001 и т.д.)'),
        sa.Column('text', sa.Text(), nullable=False, comment='Текст предложения'),
        sa.Column('explanation', sa.Text(), nullable=True, comment='Пояснення / підказка для речення (рідною мовою)'),
        sa.Column('speaker', sa.String(10), nullable=True, comment='ID спикера (1, 2 и т.д.)'),
        sa.Column('audio', sa.String(255), nullable=True, comment='Основной аудио файл'),
        sa.Column('audio_avto', sa.String(255), nullable=True, comment='Автоматический аудио файл'),
        sa.Column('audio_mic', sa.String(255), nullable=True, comment='Микрофонный аудио файл'),
        sa.Column('audio_user', sa.String(255), nullable=True, comment='Пользовательский аудио файл'),
        sa.Column('start', sa.Numeric(precision=10, scale=2), nullable=True, comment='Начало в секундах'),
        sa.Column('end', sa.Numeric(precision=10, scale=2), nullable=True, comment='Конец в секундах'),
        sa.Column('chain', sa.Boolean(), nullable=False, default=False, comment='Цепочка'),
        sa.Column('checked', sa.Boolean(), nullable=False, default=False, comment='Выбрано по умолчанию'),
    )
    
    # Создаём индексы для ускорения запросов
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_dictations_language', 'dictations', ['language_code'])
    op.create_index('idx_dictations_owner', 'dictations', ['owner_id'])
    op.create_index('idx_dictation_sentences_dictation', 'dictation_sentences', ['dictation_id'])


def downgrade() -> None:
    # Удаляем индексы
    op.drop_index('idx_dictation_sentences_dictation', 'dictation_sentences')
    op.drop_index('idx_dictations_owner', 'dictations')
    op.drop_index('idx_dictations_language', 'dictations')
    op.drop_index('idx_users_email', 'users')
    
    # Удаляем таблицы в обратном порядке (из-за внешних ключей)
    op.drop_table('dictation_sentences')
    op.drop_table('dictations')
    op.drop_table('user_learning_languages')
    op.drop_table('users')
    op.drop_table('languages')
