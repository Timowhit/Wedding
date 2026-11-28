-- ============================================================
--  019: several rooms (or floors) per venue, and an inventory of pieces off the plan
--  Each wedding's single room (venue_layouts) becomes its first room; its pieces move into it.
--  A piece whose room_id is null is in the inventory: kept for later, not drawn on any plan.
--  venue_layouts stays as it was (nothing reads it any more). Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_rooms (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID          NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  -- Null for the first room, which is shown as "Main room" in the reader's language.
  name        TEXT,
  width       NUMERIC(6,1)  NOT NULL,
  depth       NUMERIC(6,1)  NOT NULL,
  unit        TEXT          NOT NULL DEFAULT 'ft',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_rooms_unit_check CHECK (unit IN ('ft', 'm'))
);
CREATE INDEX IF NOT EXISTS venue_rooms_wedding_idx ON venue_rooms (wedding_id, created_at);

ALTER TABLE layout_items ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES venue_rooms(id) ON DELETE SET NULL;

DO $$
BEGIN
  -- Only the first time: once any room exists, a null room_id means "in the inventory".
  IF NOT EXISTS (SELECT 1 FROM venue_rooms) THEN
    INSERT INTO venue_rooms (wedding_id, width, depth, unit, created_at)
    SELECT w.id, COALESCE(v.width, 60), COALESCE(v.depth, 40), COALESCE(v.unit, 'ft'), COALESCE(v.updated_at, NOW())
    FROM weddings w
    LEFT JOIN venue_layouts v ON v.wedding_id = w.id
    WHERE v.wedding_id IS NOT NULL OR EXISTS (SELECT 1 FROM layout_items i WHERE i.wedding_id = w.id);

    UPDATE layout_items i SET room_id = r.id FROM venue_rooms r WHERE r.wedding_id = i.wedding_id AND i.room_id IS NULL;
  END IF;
END $$;
