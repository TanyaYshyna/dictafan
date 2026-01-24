-- Миграция: рефакторинг history_activity для агрегации по дням
-- Изменяем структуру таблицы для уменьшения количества записей
-- Вместо отдельных записей для каждой активности - одна запись на диктант в день

BEGIN;

-- Удаляем старые индексы
DROP INDEX IF EXISTS idx_history_activity_user_dictation;
DROP INDEX IF EXISTS idx_history_activity_created_at;
DROP INDEX IF EXISTS idx_history_activity_type;

-- Удаляем старую таблицу (данные уже очищены пользователем)
DROP TABLE IF EXISTS history_activity;

-- Создаём новую таблицу с агрегированной структурой
CREATE TABLE history_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    perfect_count INTEGER NOT NULL DEFAULT 0,
    corrected_count INTEGER NOT NULL DEFAULT 0,
    audio_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_history_activity_user_dictation_date UNIQUE (user_id, dictation_id, date)
);

COMMENT ON TABLE history_activity IS 'Агрегированная история активности пользователя по диктантам (по дням)';
COMMENT ON COLUMN history_activity.user_id IS 'ID пользователя';
COMMENT ON COLUMN history_activity.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN history_activity.date IS 'Дата активности (DATE)';
COMMENT ON COLUMN history_activity.perfect_count IS 'Количество perfect активностей за день';
COMMENT ON COLUMN history_activity.corrected_count IS 'Количество corrected активностей за день';
COMMENT ON COLUMN history_activity.audio_count IS 'Количество audio активностей за день';
COMMENT ON COLUMN history_activity.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN history_activity.updated_at IS 'Дата и время последнего обновления';

-- Создаём индексы
CREATE INDEX idx_history_activity_user_dictation ON history_activity(user_id, dictation_id);
CREATE INDEX idx_history_activity_date ON history_activity(date);
CREATE INDEX idx_history_activity_user_date ON history_activity(user_id, date);

COMMIT;

