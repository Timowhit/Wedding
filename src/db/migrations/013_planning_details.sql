-- ============================================================
--  013: planning details
--  Checklist tasks get a priority and an owner (a member of the wedding); guests get a meal
--  choice and accessibility needs.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE checklist_tasks ADD COLUMN IF NOT EXISTS priority      TEXT NOT NULL DEFAULT 'normal';
-- Shown only while that person is still a member of the wedding (see models/checklist.js).
ALTER TABLE checklist_tasks ADD COLUMN IF NOT EXISTS assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE guests          ADD COLUMN IF NOT EXISTS meal          TEXT;
ALTER TABLE guests          ADD COLUMN IF NOT EXISTS accessibility TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_tasks_priority_check') THEN
    ALTER TABLE checklist_tasks ADD CONSTRAINT checklist_tasks_priority_check CHECK (priority IN ('high', 'normal', 'low'));
  END IF;
END $$;
