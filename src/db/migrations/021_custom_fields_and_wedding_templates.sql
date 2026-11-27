-- ============================================================
--  021: custom fields, and whole-wedding templates
--  A wedding's own fields for guests, vendors and tasks (text, number, yes/no or a choice);
--  values live in a `custom` JSON object on each row, keyed by field id. Templates gain the
--  'wedding' kind: a whole setup (tasks, schedule, budget categories, vendors, custom fields).
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_fields (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id  UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  entity      TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  options     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_fields_entity_check CHECK (entity IN ('guest', 'vendor', 'task')),
  CONSTRAINT custom_fields_type_check CHECK (type IN ('text', 'number', 'yesno', 'choice'))
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_label_key ON custom_fields (wedding_id, entity, LOWER(label));

ALTER TABLE guests          ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vendors         ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE checklist_tasks ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_kind_check'
             AND pg_get_constraintdef(oid) NOT LIKE '%wedding%') THEN
    ALTER TABLE templates DROP CONSTRAINT templates_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_kind_check') THEN
    ALTER TABLE templates ADD CONSTRAINT templates_kind_check CHECK (kind IN ('checklist', 'schedule', 'wedding'));
  END IF;
END $$;
