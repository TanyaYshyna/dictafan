BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS money_balance BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_money_ledger (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta BIGINT NOT NULL,
    reason TEXT,
    dictation_id INTEGER,
    positions INTEGER[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_money_ledger_user_id_created_at ON user_money_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_money_ledger_dictation_id ON user_money_ledger(dictation_id);

COMMIT;
