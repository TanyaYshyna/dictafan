-- Add daily activity goal for Plan/Fact display
-- Default: 100

ALTER TABLE users
ADD COLUMN IF NOT EXISTS daily_activity_goal INTEGER NOT NULL DEFAULT 100;

-- Optional: backfill NULLs if the column existed without NOT NULL (safety)
UPDATE users
SET daily_activity_goal = 100
WHERE daily_activity_goal IS NULL;
