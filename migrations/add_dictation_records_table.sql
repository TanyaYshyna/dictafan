-- Миграция: таблица рекордов по диктантам (dictation_records)
--
-- В эту таблицу записываются только рекорды пользователя по каждому диктанту.
-- Критерий рекорда:
--   1) Минимальное количество ошибок (mistake_count)
--   2) Если ошибок столько же (или 0) — минимальное время (lead_time)
--
-- Запись делается в момент успешного завершения диктанта.
-- Если это новый рекорд — в модалке успеха показывается сообщение.

BEGIN;

CREATE TABLE IF NOT EXISTS dictation_records (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    positions INTEGER[] NOT NULL DEFAULT '{}',
    date_of_victory TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    perfect_count INTEGER NOT NULL DEFAULT 0,
    corrected_count INTEGER NOT NULL DEFAULT 0,
    audio_count INTEGER NOT NULL DEFAULT 0,
    activity_count INTEGER NOT NULL DEFAULT 0,
    lead_time BIGINT NOT NULL DEFAULT 0,
    mistake_count INTEGER NOT NULL DEFAULT 0,
    monenumber_of_characters INTEGER NOT NULL DEFAULT 0,
    money_dt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Один рекорд на пользователя + диктант + набор позиций
    CONSTRAINT uq_dictation_records_user_dictation_positions UNIQUE (user_id, dictation_id, positions)
);

-- Индексы для быстрого поиска рекорда
CREATE INDEX IF NOT EXISTS idx_dictation_records_user_dictation
    ON dictation_records(user_id, dictation_id);

CREATE INDEX IF NOT EXISTS idx_dictation_records_user_dictation_positions
    ON dictation_records(user_id, dictation_id, positions);

-- Индекс для поиска по пользователю
CREATE INDEX IF NOT EXISTS idx_dictation_records_user_id
    ON dictation_records(user_id);

COMMENT ON TABLE dictation_records IS 'Рекорды пользователей по диктантам (лучший результат по ошибкам/времени)';
COMMENT ON COLUMN dictation_records.user_id IS 'ID пользователя';
COMMENT ON COLUMN dictation_records.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN dictation_records.positions IS 'Позиции предложений (пустой массив = весь диктант)';
COMMENT ON COLUMN dictation_records.date_of_victory IS 'Дата и время установки рекорда';
COMMENT ON COLUMN dictation_records.perfect_count IS 'Число предложений сделанных на звезду (perfect)';
COMMENT ON COLUMN dictation_records.corrected_count IS 'Число предложений сделанных на полузвезду (corrected)';
COMMENT ON COLUMN dictation_records.audio_count IS 'Число засчитанных аудио';
COMMENT ON COLUMN dictation_records.activity_count IS 'Количество активностей';
COMMENT ON COLUMN dictation_records.lead_time IS 'Время выполнения в миллисекундах';
COMMENT ON COLUMN dictation_records.mistake_count IS 'Количество ошибок';
COMMENT ON COLUMN dictation_records.monenumber_of_characters IS 'Количество символов';
COMMENT ON COLUMN dictation_records.money_dt_count IS 'Заработано монет';

COMMIT;
