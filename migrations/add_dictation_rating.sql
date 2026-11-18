-- Миграция: рейтинг/оценка диктантов (голосование от 1 до 10)
--
-- Модель хранения:
--   dictations.points     = сумма выставленных оценок (например, 88)
--   dictations.points_max = сумма максимумов = число_голосов * 10 (например, 10 голосов -> 100)
--
-- Средний балл (с одним знаком после запятой) считается на клиенте/бэкенде как:
--   rating = points * 10.0 / points_max   (пример: 88 * 10 / 100 = 8.8)
--
-- Голосование:
--   dictation_votes — одна строка = один голос пользователя.
--   UNIQUE (user_id, dictation_id) даёт сразу:
--     * мгновенный ответ "голосовал ли пользователь по этому диктанту";
--     * защиту от дублирования на уровне БД.
--   Переголосование разрешено: повторный INSERT обновляет оценку через ON CONFLICT,
--   а триггер автоматически поддерживает кэш points/points_max в консистентности.
--
-- Миграция идемпотентна (безопасно запускать повторно).

BEGIN;

-- ============================================================
-- 1. Поля кэша агрегата в таблице dictations
-- ============================================================
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dictations ADD COLUMN IF NOT EXISTS points_max INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN dictations.points IS 'Сумма выставленных пользователями оценок диктанта (баллы из 10)';
COMMENT ON COLUMN dictations.points_max IS 'Сумма максимальных баллов = количество голосов * 10';

-- ============================================================
-- 2. Таблица голосов
-- ============================================================
CREATE TABLE IF NOT EXISTS dictation_votes (
    id SERIAL PRIMARY KEY,
    dictation_id INTEGER NOT NULL REFERENCES dictations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 10),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dictation_votes_user_dictation UNIQUE (user_id, dictation_id)
);

COMMENT ON TABLE dictation_votes IS 'Оценки (голоса) пользователей за диктанты, от 1 до 10';
COMMENT ON COLUMN dictation_votes.dictation_id IS 'ID диктанта';
COMMENT ON COLUMN dictation_votes.user_id IS 'ID проголосовавшего пользователя';
COMMENT ON COLUMN dictation_votes.points IS 'Оценка пользователя (1..10)';
COMMENT ON COLUMN dictation_votes.created_at IS 'Когда голос был поставлен впервые';
COMMENT ON COLUMN dictation_votes.updated_at IS 'Когда голос был изменён в последний раз';

-- Индекс для выборки всех голосов по диктанту и удаления каскадом.
CREATE INDEX IF NOT EXISTS idx_dictation_votes_dictation_id
    ON dictation_votes(dictation_id);

-- ============================================================
-- 3. Триггер поддержания кэша points/points_max
-- ============================================================
CREATE OR REPLACE FUNCTION dictation_votes_recalc()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE dictations
        SET points = COALESCE(points, 0) - OLD.points,
            points_max = COALESCE(points_max, 0) - 10
        WHERE id = OLD.dictation_id;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.dictation_id = NEW.dictation_id THEN
            -- Оценка изменилась, количество голосов не изменилось.
            UPDATE dictations
            SET points = COALESCE(points, 0) - OLD.points + NEW.points
            WHERE id = NEW.dictation_id;
        ELSE
            -- Голос перенесён на другой диктант (теоретический случай).
            UPDATE dictations
            SET points = COALESCE(points, 0) - OLD.points,
                points_max = COALESCE(points_max, 0) - 10
            WHERE id = OLD.dictation_id;
            UPDATE dictations
            SET points = COALESCE(points, 0) + NEW.points,
                points_max = COALESCE(points_max, 0) + 10
            WHERE id = NEW.dictation_id;
        END IF;
        RETURN NEW;
    END IF;

    -- INSERT
    UPDATE dictations
    SET points = COALESCE(points, 0) + NEW.points,
        points_max = COALESCE(points_max, 0) + 10
    WHERE id = NEW.dictation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dictation_votes_recalc ON dictation_votes;
CREATE TRIGGER trg_dictation_votes_recalc
    AFTER INSERT OR UPDATE OR DELETE ON dictation_votes
    FOR EACH ROW
    EXECUTE FUNCTION dictation_votes_recalc();

COMMIT;
