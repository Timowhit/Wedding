-- ============================================================
--  017: the highest checklist milestone each wedding has celebrated
--  So unticking a task and ticking it again doesn't replay the big celebration.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE weddings ADD COLUMN IF NOT EXISTS celebrated_milestone SMALLINT NOT NULL DEFAULT 0;
