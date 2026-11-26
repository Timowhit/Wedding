-- ============================================================
--  008: planner release
--  * planner accounts, founding numbers, colour themes
--  * planner-managed weddings and the client / planner-handover roles
--  * decisions, event-day schedule, seating chart
--  Safe to run more than once.
-- ============================================================

-- Accounts and themes
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type    TEXT    NOT NULL DEFAULT 'couple';
ALTER TABLE users ADD COLUMN IF NOT EXISTS founding_number INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_palette   TEXT    NOT NULL DEFAULT 'rose';
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_mode      TEXT    NOT NULL DEFAULT 'auto';
ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_palette   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_type_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('couple', 'planner'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_founding_number_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_founding_number_check CHECK (founding_number BETWEEN 1 AND 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_founding_number_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_founding_number_key UNIQUE (founding_number);
  END IF;
END $$;

-- One row that hands out founding numbers in order. Locking this row (SELECT ... FOR UPDATE)
-- serialises concurrent claims; the UNIQUE constraint above is the final guard.
CREATE TABLE IF NOT EXISTS founding_counter (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  next_number INTEGER NOT NULL DEFAULT 1
);
INSERT INTO founding_counter (id, next_number) VALUES (TRUE, 1) ON CONFLICT (id) DO NOTHING;

-- Weddings run by a planner
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS planner_managed BOOLEAN NOT NULL DEFAULT FALSE;

-- Roles: 'client' for couples in a planner wedding; 'planner' only as an invite (handover)
ALTER TABLE wedding_members DROP CONSTRAINT IF EXISTS wedding_members_role_check;
ALTER TABLE wedding_members ADD CONSTRAINT wedding_members_role_check
  CHECK (role IN ('owner', 'editor', 'client', 'viewer'));
ALTER TABLE wedding_invites DROP CONSTRAINT IF EXISTS wedding_invites_role_check;
ALTER TABLE wedding_invites ADD CONSTRAINT wedding_invites_role_check
  CHECK (role IN ('editor', 'client', 'viewer', 'planner'));

-- Decisions the planner puts to the couple
CREATE TABLE IF NOT EXISTS decisions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  details     TEXT,
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'changes_requested')),
  comment     TEXT,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  answered_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decisions_wedding ON decisions(wedding_id);

-- Event-day schedule
CREATE TABLE IF NOT EXISTS schedule_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  starts_at   TIME        NOT NULL,
  ends_at     TIME,
  title       TEXT        NOT NULL,
  location    TEXT,
  vendor_id   UUID        REFERENCES vendors(id) ON DELETE SET NULL,
  contact     TEXT,
  notes       TEXT,
  contingency TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_wedding ON schedule_items(wedding_id);

-- Seating chart
CREATE TABLE IF NOT EXISTS seating_tables (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  seats       INTEGER     NOT NULL CHECK (seats BETWEEN 1 AND 30),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wedding_id, name)
);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS table_id   UUID REFERENCES seating_tables(id) ON DELETE SET NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS group_name TEXT;

-- updated_at triggers for the new tables (set_updated_at() comes from migration 000/001)
DROP TRIGGER IF EXISTS trg_decisions_updated_at ON decisions;
CREATE TRIGGER trg_decisions_updated_at BEFORE UPDATE ON decisions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_schedule_items_updated_at ON schedule_items;
CREATE TRIGGER trg_schedule_items_updated_at BEFORE UPDATE ON schedule_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
