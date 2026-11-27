-- ============================================================
--  017: small follow-ups
--  - The highest checklist milestone each wedding has celebrated, so unticking a task and
--    ticking it again doesn't replay the big celebration.
--  - Message template names are unique without regard to capital letters.
--  Safe to run more than once.
-- ============================================================

ALTER TABLE weddings ADD COLUMN IF NOT EXISTS celebrated_milestone SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'message_templates_user_kind_lower_name_key') THEN
    -- Names that only differ in capitals get a short suffix first, so the new rule can hold.
    UPDATE message_templates m SET name = m.name || ' (' || LEFT(m.id::text, 4) || ')'
    WHERE EXISTS (
      SELECT 1 FROM message_templates o
      WHERE o.user_id = m.user_id AND o.kind = m.kind AND LOWER(o.name) = LOWER(m.name) AND o.id < m.id
    );
    CREATE UNIQUE INDEX message_templates_user_kind_lower_name_key ON message_templates (user_id, kind, LOWER(name));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_user_kind_name_key') THEN
    ALTER TABLE message_templates DROP CONSTRAINT message_templates_user_kind_name_key;
  END IF;
END $$;
