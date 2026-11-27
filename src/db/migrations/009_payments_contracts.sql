-- ============================================================
--  009: payments and contracts
--  * contract details on vendors (all optional)
--  * a payment schedule per vendor
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_total        NUMERIC(12,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_signed_on    DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_url          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_includes     TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_cancellation TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_contract_total_check') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_contract_total_check CHECK (contract_total >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_payments (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID          NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id   UUID          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  label       TEXT,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date    DATE,
  paid_on     DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_payments_vendor_idx ON vendor_payments (vendor_id);
-- "Payments due" reads unpaid payments by wedding and due date.
CREATE INDEX IF NOT EXISTS vendor_payments_unpaid_idx ON vendor_payments (wedding_id, due_date) WHERE paid_on IS NULL;

DROP TRIGGER IF EXISTS trg_vendor_payments_updated_at ON vendor_payments;
CREATE TRIGGER trg_vendor_payments_updated_at BEFORE UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
