-- ============================================================
--  018: each wedding's own budget categories
--  The suggested categories (builtin_key, translated in the app) plus the wedding's own
--  (name), each with an optional planned amount. Expenses keep storing the category's value:
--  the key for a suggested one, the name for the wedding's own.
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_categories (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id   UUID          NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  builtin_key  TEXT,
  name         TEXT,
  planned      NUMERIC(12,2),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT budget_categories_one_label CHECK ((builtin_key IS NULL) <> (name IS NULL)),
  CONSTRAINT budget_categories_planned_check CHECK (planned IS NULL OR planned >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_wedding_value_key
  ON budget_categories (wedding_id, LOWER(COALESCE(builtin_key, name)));
