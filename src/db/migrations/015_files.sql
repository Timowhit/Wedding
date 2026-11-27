-- ============================================================
--  015: files
--  Contracts, floor plans, inspiration photos and other files, stored in the database itself
--  (Render's disk is wiped on every deploy). Lists never select `data`.
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS wedding_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id    UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id     UUID        REFERENCES vendors(id) ON DELETE SET NULL,
  uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  kind          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  content_type  TEXT        NOT NULL,
  size          INTEGER     NOT NULL,
  note          TEXT,
  data          BYTEA       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wedding_files_wedding_idx ON wedding_files (wedding_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wedding_files_kind_check') THEN
    ALTER TABLE wedding_files ADD CONSTRAINT wedding_files_kind_check
      CHECK (kind IN ('contract', 'floor_plan', 'inspiration', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wedding_files_size_check') THEN
    ALTER TABLE wedding_files ADD CONSTRAINT wedding_files_size_check CHECK (size > 0);
  END IF;
END $$;
