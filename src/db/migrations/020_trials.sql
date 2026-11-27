-- ============================================================
--  020: the playground (a private trial without signing up)
--  A trial is a users row with is_trial set and a placeholder .invalid email; signing up turns
--  the same row into a real account, so the trial wedding is kept. last_seen_at lets trials left
--  alone for a day be deleted, with the weddings only they belonged to.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trial     BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_trial_seen_idx ON users (last_seen_at) WHERE is_trial;
