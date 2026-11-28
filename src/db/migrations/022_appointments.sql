-- ============================================================
--  022: appointments
--  Meetings with vendors and the people planning: a date, an optional start and end time,
--  where, who is coming and notes. Shown on the dashboard, calendar and reminder email.
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  starts_on   DATE        NOT NULL,
  starts_at   TIME,
  ends_at     TIME,
  location    TEXT,
  attendees   TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_times_check CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at >= starts_at))
);
CREATE INDEX IF NOT EXISTS appointments_wedding_date_idx ON appointments (wedding_id, starts_on);
