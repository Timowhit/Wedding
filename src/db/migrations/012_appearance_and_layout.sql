-- ============================================================
--  012: appearance and venue layout
--  Custom colours (a key such as "a85a73-4f7a59-b8862b-p", see src/themes.js) for a person and
--  for a wedding, the wedding's colour swatches, and the venue floor plan.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE users    ADD COLUMN IF NOT EXISTS theme_colors TEXT;
-- Null means the wedding's colours are not applied to the app.
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS theme_colors TEXT;

CREATE TABLE IF NOT EXISTS wedding_colors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  hex         TEXT        NOT NULL,
  name        TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wedding_colors_wedding_idx ON wedding_colors (wedding_id, sort_order);

-- One room per wedding. Sizes are in the chosen unit; positions are the centre of each piece.
CREATE TABLE IF NOT EXISTS venue_layouts (
  wedding_id  UUID          PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  width       NUMERIC(6,1)  NOT NULL,
  depth       NUMERIC(6,1)  NOT NULL,
  unit        TEXT          NOT NULL DEFAULT 'ft',
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layout_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID          NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind        TEXT          NOT NULL,
  label       TEXT,
  -- A placed seating table; removing the table removes it from the plan.
  table_id    UUID          UNIQUE REFERENCES seating_tables(id) ON DELETE CASCADE,
  shape       TEXT          NOT NULL DEFAULT 'rect',
  x           NUMERIC(6,1)  NOT NULL,
  y           NUMERIC(6,1)  NOT NULL,
  width       NUMERIC(6,1)  NOT NULL,
  depth       NUMERIC(6,1)  NOT NULL,
  rotation    INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS layout_items_wedding_idx ON layout_items (wedding_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wedding_colors_hex_check') THEN
    ALTER TABLE wedding_colors ADD CONSTRAINT wedding_colors_hex_check CHECK (hex ~ '^#[0-9a-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_layouts_unit_check') THEN
    ALTER TABLE venue_layouts ADD CONSTRAINT venue_layouts_unit_check CHECK (unit IN ('ft', 'm'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'layout_items_shape_check') THEN
    ALTER TABLE layout_items ADD CONSTRAINT layout_items_shape_check CHECK (shape IN ('rect', 'round'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'layout_items_rotation_check') THEN
    ALTER TABLE layout_items ADD CONSTRAINT layout_items_rotation_check CHECK (rotation BETWEEN 0 AND 359);
  END IF;
END $$;
