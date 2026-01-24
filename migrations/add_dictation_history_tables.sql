т   -- Миграция: добавление таблиц истории диктантов
-- Revision ID: a1b2c3d4e5f6
-- Revises: cd02267e

BEGIN;

-- Добавляем поле remember_unfinished_dictations в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS remember_unfinished_dictations BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.remember_unfinished_dictations IS 'Помнить прогресс незаконченных диктантов';

-- Добавляем поле remember_unfinished_dictations в таблицу dictations (дублирование)
ALTER TABLE dictations 
ADD COLUMN IF NOT EXISTS remember_unfinished_dictations BOOLEAN;

COMMENT ON COLUMN dictations.remember_unfinished_dictations IS 'Помнить прогресс незаконченных диктантов (дублирование из users)';

-- Создаём таблицу history_activity (детальная история активности)
CREATE TABLE IF NOT EXISTS history_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    sentence_key VARCHAR(50),
    type_activity VARCHAR(20) NOT NULL,
    number INTEGER DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE history_activity IS 'Детальная история активности пользователя по каждому предложению';
COMMENT ON COLUMN history_activity.user_id IS 'ID пользователя';
COMMENT ON COLUMN history_activity.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN history_activity.sentence_key IS 'Ключ предложения (000, 001 и т.д.) - может быть NULL для общей активности';
COMMENT ON COLUMN history_activity.type_activity IS 'Тип активности: perfect, corrected, audio';
COMMENT ON COLUMN history_activity.number IS 'Количество (опционально, для удобства запросов)';
COMMENT ON COLUMN history_activity.created_at IS 'Дата и время создания записи (используется вместо date и time)';

-- Индексы для history_activity
CREATE INDEX IF NOT EXISTS idx_history_activity_user_dictation ON history_activity(user_id, dictation_id);
CREATE INDEX IF NOT EXISTS idx_history_activity_created_at ON history_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_history_activity_type ON history_activity(type_activity);

-- Создаём таблицу history_successes (агрегированная статистика успехов)
CREATE TABLE IF NOT EXISTS history_successes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    type_activity_perfect INTEGER NOT NULL DEFAULT 0,
    type_activity_corrected INTEGER NOT NULL DEFAULT 0,
    type_activity_audio INTEGER NOT NULL DEFAULT 0,
    time_ms BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_history_successes_user_dictation UNIQUE (user_id, dictation_id)
);

COMMENT ON TABLE history_successes IS 'Агрегированная статистика успехов пользователя по диктанту';
COMMENT ON COLUMN history_successes.user_id IS 'ID пользователя';
COMMENT ON COLUMN history_successes.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN history_successes.type_activity_perfect IS 'Число предложений сделанных на звезду (perfect)';
COMMENT ON COLUMN history_successes.type_activity_corrected IS 'Число предложений сделанных на полузвезду (corrected)';
COMMENT ON COLUMN history_successes.type_activity_audio IS 'Число засчитанных аудио';
COMMENT ON COLUMN history_successes.time_ms IS 'Время потраченное на выполнение в миллисекундах';
COMMENT ON COLUMN history_successes.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN history_successes.updated_at IS 'Дата и время обновления записи';

-- Индексы для history_successes
CREATE INDEX IF NOT EXISTS idx_history_successes_user_dictation ON history_successes(user_id, dictation_id);
CREATE INDEX IF NOT EXISTS idx_history_successes_created_at ON history_successes(created_at);

-- Создаём таблицу history_unclosed_dictations (незаконченные диктанты)
CREATE TABLE IF NOT EXISTS history_unclosed_dictations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    time_ms BIGINT NOT NULL DEFAULT 0,
    audio_settings_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_unclosed_user_dictation UNIQUE (user_id, dictation_id)
);

COMMENT ON TABLE history_unclosed_dictations IS 'Данные о незаконченных диктантах пользователя';
COMMENT ON COLUMN history_unclosed_dictations.user_id IS 'ID пользователя';
COMMENT ON COLUMN history_unclosed_dictations.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN history_unclosed_dictations.time_ms IS 'Время потраченное на выполнение в миллисекундах';
COMMENT ON COLUMN history_unclosed_dictations.audio_settings_json IS 'JSON с настройками аудио: {"start": "oto", "typo": "ot", "success": "to", "order": "mixed|direct", "repeats": 3}';
COMMENT ON COLUMN history_unclosed_dictations.created_at IS 'Дата и время начала работы над диктантом';
COMMENT ON COLUMN history_unclosed_dictations.updated_at IS 'Дата и время последнего обновления';

-- Индексы для history_unclosed_dictations
CREATE INDEX IF NOT EXISTS idx_unclosed_user_dictation ON history_unclosed_dictations(user_id, dictation_id);
CREATE INDEX IF NOT EXISTS idx_unclosed_updated_at ON history_unclosed_dictations(updated_at);

-- Создаём таблицу history_unclosed_dictations_sentences (данные по предложениям незаконченных диктантов)
CREATE TABLE IF NOT EXISTS history_unclosed_dictations_sentences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    sentence_key VARCHAR(50) NOT NULL,
    type_activity_perfect INTEGER NOT NULL DEFAULT 0,
    type_activity_corrected INTEGER NOT NULL DEFAULT 0,
    type_activity_audio INTEGER NOT NULL DEFAULT 0,
    checked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_unclosed_sentences_user_dictation_key UNIQUE (user_id, dictation_id, sentence_key)
);

COMMENT ON TABLE history_unclosed_dictations_sentences IS 'Данные по предложениям незаконченных диктантов';
COMMENT ON COLUMN history_unclosed_dictations_sentences.user_id IS 'ID пользователя';
COMMENT ON COLUMN history_unclosed_dictations_sentences.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN history_unclosed_dictations_sentences.sentence_key IS 'Ключ предложения (000, 001 и т.д.)';
COMMENT ON COLUMN history_unclosed_dictations_sentences.type_activity_perfect IS 'Число предложений сделанных на звезду';
COMMENT ON COLUMN history_unclosed_dictations_sentences.type_activity_corrected IS 'Число предложений сделанных на полузвезду';
COMMENT ON COLUMN history_unclosed_dictations_sentences.type_activity_audio IS 'Число засчитанных аудио';
COMMENT ON COLUMN history_unclosed_dictations_sentences.checked IS 'Выбрано ли предложение в списке для тренировки';
COMMENT ON COLUMN history_unclosed_dictations_sentences.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN history_unclosed_dictations_sentences.updated_at IS 'Дата и время обновления записи';

-- Индексы для history_unclosed_dictations_sentences
CREATE INDEX IF NOT EXISTS idx_unclosed_sentences_user_dictation ON history_unclosed_dictations_sentences(user_id, dictation_id);
CREATE INDEX IF NOT EXISTS idx_unclosed_sentences_key ON history_unclosed_dictations_sentences(sentence_key);

COMMIT;

