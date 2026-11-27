-- ============================================================
--  010: templates
--  A person's reusable checklists and event-day timelines. Items are stored whole as JSONB:
--  a template is always read and written as one piece.
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  items       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_kind_check') THEN
    ALTER TABLE templates ADD CONSTRAINT templates_kind_check CHECK (kind IN ('checklist', 'schedule'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_name_check') THEN
    ALTER TABLE templates ADD CONSTRAINT templates_name_check CHECK (char_length(name) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_user_kind_name_key') THEN
    ALTER TABLE templates ADD CONSTRAINT templates_user_kind_name_key UNIQUE (user_id, kind, name);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates;
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
