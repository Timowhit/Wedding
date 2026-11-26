-- ============================================================
--  Forever Planner — 005_user_language
--
--  Adds per-user language preference (default: English).
--  Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';