"""add_dictation_history_tables

Revision ID: a1b2c3d4e5f6
Revises: cd02267e
Create Date: 2025-01-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'cd02267e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле remember_unfinished_dictations в таблицу users
    op.add_column('users',
        sa.Column('remember_unfinished_dictations', sa.Boolean(), nullable=False, 
                  server_default=sa.text('false'),
                  comment='Помнить прогресс незаконченных диктантов')
    )
    
    # Добавляем поле remember_unfinished_dictations в таблицу dictations (дублирование)
    op.add_column('dictations',
        sa.Column('remember_unfinished_dictations', sa.Boolean(), nullable=True,
                  comment='Помнить прогресс незаконченных диктантов (дублирование из users)')
    )
    
    # Создаём таблицу history_activity (детальная история активности)
    op.create_table(
        'history_activity',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID пользователя'),
        sa.Column('dictation_id', sa.Integer(), sa.ForeignKey('dictations.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID диктанта'),
        sa.Column('sentence_key', sa.String(50), nullable=True, 
                  comment='Ключ предложения (000, 001 и т.д.) - может быть NULL для общей активности'),
        sa.Column('type_activity', sa.String(20), nullable=False, 
                  comment='Тип активности: perfect, corrected, audio'),
        sa.Column('number', sa.Integer(), nullable=True, default=1, 
                  comment='Количество (опционально, для удобства запросов)'),
        sa.Column('created_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время создания записи (используется вместо date и time)'),
        sa.Index('idx_history_activity_user_dictation', ['user_id', 'dictation_id']),
        sa.Index('idx_history_activity_created_at', ['created_at']),
        sa.Index('idx_history_activity_type', ['type_activity']),
    )
    
    # Создаём таблицу history_successes (агрегированная статистика успехов)
    op.create_table(
        'history_successes',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID пользователя'),
        sa.Column('dictation_id', sa.Integer(), sa.ForeignKey('dictations.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID диктанта'),
        sa.Column('type_activity_perfect', sa.Integer(), nullable=False, default=0,
                  comment='Число предложений сделанных на звезду (perfect)'),
        sa.Column('type_activity_corrected', sa.Integer(), nullable=False, default=0,
                  comment='Число предложений сделанных на полузвезду (corrected)'),
        sa.Column('type_activity_audio', sa.Integer(), nullable=False, default=0,
                  comment='Число засчитанных аудио'),
        sa.Column('time_ms', sa.BigInteger(), nullable=False, default=0,
                  comment='Время потраченное на выполнение в миллисекундах'),
        sa.Column('created_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время создания записи'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время обновления записи'),
        sa.UniqueConstraint('user_id', 'dictation_id', name='uq_history_successes_user_dictation'),
        sa.Index('idx_history_successes_user_dictation', ['user_id', 'dictation_id']),
        sa.Index('idx_history_successes_created_at', ['created_at']),
    )
    
    # Создаём таблицу history_unclosed_dictations (незаконченные диктанты)
    op.create_table(
        'history_unclosed_dictations',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID пользователя'),
        sa.Column('dictation_id', sa.Integer(), sa.ForeignKey('dictations.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID диктанта'),
        sa.Column('time_ms', sa.BigInteger(), nullable=False, default=0,
                  comment='Время потраченное на выполнение в миллисекундах'),
        sa.Column('audio_settings_json', sa.Text(), nullable=True,
                  comment='JSON с настройками аудио: {"start": "oto", "typo": "ot", "success": "to", "order": "mixed|direct", "repeats": 3}'),
        sa.Column('created_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время начала работы над диктантом'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время последнего обновления'),
        sa.UniqueConstraint('user_id', 'dictation_id', name='uq_unclosed_user_dictation'),
        sa.Index('idx_unclosed_user_dictation', ['user_id', 'dictation_id']),
        sa.Index('idx_unclosed_updated_at', ['updated_at']),
    )
    
    # Создаём таблицу history_unclosed_dictations_sentences (данные по предложениям незаконченных диктантов)
    op.create_table(
        'history_unclosed_dictations_sentences',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID пользователя'),
        sa.Column('dictation_id', sa.Integer(), sa.ForeignKey('dictations.id', ondelete='CASCADE'), 
                  nullable=False, comment='ID диктанта'),
        sa.Column('sentence_key', sa.String(50), nullable=False, 
                  comment='Ключ предложения (000, 001 и т.д.)'),
        sa.Column('type_activity_perfect', sa.Integer(), nullable=False, default=0,
                  comment='Число предложений сделанных на звезду'),
        sa.Column('type_activity_corrected', sa.Integer(), nullable=False, default=0,
                  comment='Число предложений сделанных на полузвезду'),
        sa.Column('type_activity_audio', sa.Integer(), nullable=False, default=0,
                  comment='Число засчитанных аудио'),
        sa.Column('checked', sa.Boolean(), nullable=False, default=False,
                  comment='Выбрано ли предложение в списке для тренировки'),
        sa.Column('created_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время создания записи'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, 
                  server_default=sa.text('CURRENT_TIMESTAMP'), 
                  comment='Дата и время обновления записи'),
        sa.UniqueConstraint('user_id', 'dictation_id', 'sentence_key', 
                          name='uq_unclosed_sentences_user_dictation_key'),
        sa.Index('idx_unclosed_sentences_user_dictation', ['user_id', 'dictation_id']),
        sa.Index('idx_unclosed_sentences_key', ['sentence_key']),
    )


def downgrade() -> None:
    # Удаляем таблицы в обратном порядке (из-за внешних ключей)
    op.drop_table('history_unclosed_dictations_sentences')
    op.drop_table('history_unclosed_dictations')
    op.drop_table('history_successes')
    op.drop_table('history_activity')
    
    # Удаляем поля из таблиц
    op.drop_column('dictations', 'remember_unfinished_dictations')
    op.drop_column('users', 'remember_unfinished_dictations')

