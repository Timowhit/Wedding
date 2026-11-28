-- ============================================================
--  024: vendor availability and proposals
--  Whether a vendor is free on the day (or holding it until a date), and the quotes they send:
--  a title, an amount, how long it stands, an optional uploaded file, notes, and whether it was
--  accepted or declined. Proposal amounts are for comparing only; money still comes from
--  contracts and payments.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS hold_until DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_availability_check') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_availability_check
      CHECK (availability IN ('unknown', 'available', 'hold', 'unavailable'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_proposals (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id   UUID          NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id    UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title        TEXT          NOT NULL,
  amount       NUMERIC(12,2) CHECK (amount >= 0),
  valid_until  DATE,
  file_id      UUID          REFERENCES wedding_files(id) ON DELETE SET NULL,
  notes        TEXT,
  status       TEXT          NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_proposals_vendor_idx ON vendor_proposals (wedding_id, vendor_id);
