-- Миграция: Telegram уведомления (привязка chat_id + настройки)
-- Revision ID: telegram_notifications_001

BEGIN;

-- users: куда слать уведомления
ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- одноразовый код для привязки: /start <code>
ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_link_code ON users(telegram_link_code);

COMMENT ON COLUMN users.telegram_chat_id IS 'Telegram chat_id для отправки уведомлений';
COMMENT ON COLUMN users.telegram_enabled IS 'Если true — пользователь хочет получать уведомления в Telegram';
COMMENT ON COLUMN users.telegram_link_code IS 'Одноразовый код для привязки Telegram (команда /start <code>)';

-- group_students: хочет ли учитель получать уведомления от этого ученика
ALTER TABLE group_students
ADD COLUMN IF NOT EXISTS notify_teacher_on_success BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN group_students.notify_teacher_on_success IS 'Если true — учитель получает уведомления об успехах этого ученика';

COMMIT;
