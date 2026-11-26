-- ============================================================
--  Forever Planner — 003_fix_user_id_nullable
--
--  Root cause of all HTTP 500 errors on write operations:
--  Migration 002 added wedding_id but never removed NOT NULL
--  from user_id. Every model INSERT only provides wedding_id,
--  so PostgreSQL rejects the write with a constraint violation.
--
--  budget_limits is worse: user_id was the PRIMARY KEY, so
--  INSERT INTO budget_limits (wedding_id, total) fails with a
--  primary-key violation before even reaching the NOT NULL check.
--
--  This migration is idempotent — safe to re-run.
-- ============================================================

-- ── budget_limits: change primary key from user_id → id ──────

-- Add UUID primary-key column (idempotent)
ALTER TABLE budget_limits
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Populate for any existing rows
UPDATE budget_limits SET id = gen_random_uuid() WHERE id IS NULL;

-- Make the column NOT NULL
ALTER TABLE budget_limits ALTER COLUMN id SET NOT NULL;

-- Drop old primary key (user_id), promote id
-- Wrapped in DO block so re-running doesn't error
DO $$
BEGIN
  -- Drop whichever PK currently exists
  ALTER TABLE budget_limits DROP CONSTRAINT IF EXISTS budget_limits_pkey;
EXCEPTION WHEN others THEN
  NULL; -- ignore if already gone
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'budget_limits_pkey'
      AND contype = 'p'
      AND conrelid = 'budget_limits'::regclass
  ) THEN
    ALTER TABLE budget_limits ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Make user_id nullable (it's now just a soft back-reference)
ALTER TABLE budget_limits ALTER COLUMN user_id DROP NOT NULL;

-- ── All other feature tables: make user_id nullable ───────────
ALTER TABLE budget_items       ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE checklist_tasks    ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE guests             ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE vendors            ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE music_tracks       ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE inspiration_photos ALTER COLUMN user_id DROP NOT NULL;
