-- ============================================================
--  023: reminder choices
--  Each person picks how far ahead the summary looks, whether it comes daily or weekly
--  (Mondays), and which kinds of things it lists. The defaults match what everyone got before.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_days INT NOT NULL DEFAULT 7;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_frequency TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_kinds TEXT[] NOT NULL
  DEFAULT ARRAY['payments', 'tasks', 'decisions', 'appointments']::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_reminder_days_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_reminder_days_check CHECK (reminder_days IN (1, 3, 7, 14, 30));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_reminder_frequency_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_reminder_frequency_check CHECK (reminder_frequency IN ('daily', 'weekly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_reminder_kinds_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_reminder_kinds_check
      CHECK (reminder_kinds <@ ARRAY['payments', 'tasks', 'decisions', 'appointments']::text[]);
  END IF;
END $$;
