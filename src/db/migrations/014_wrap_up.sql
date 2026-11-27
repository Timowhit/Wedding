-- ============================================================
--  014: post-event wrap-up
--  Weddings can be archived (hidden from active lists, the calendar and reminders) and booked
--  vendors can be rated after the day.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE weddings ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS rating      SMALLINT;
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS review      TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_rating_check') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_rating_check CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;
