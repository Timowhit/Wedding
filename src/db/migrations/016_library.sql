-- ============================================================
--  016: messages and questionnaires library
--  A person's own message templates and questionnaires (never shared with a wedding), and
--  questionnaires sent to a wedding: a copy of the questions plus the couple's answers.
--  Only adds things. Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  subject     TEXT,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  intro       TEXT,
  questions   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wedding_questionnaires (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id   UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  intro        TEXT,
  questions    JSONB       NOT NULL,
  answers      JSONB,
  sent_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  answered_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wedding_questionnaires_wedding_idx ON wedding_questionnaires (wedding_id, sent_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_kind_check') THEN
    ALTER TABLE message_templates ADD CONSTRAINT message_templates_kind_check CHECK (kind IN ('email', 'follow_up', 'proposal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_templates_user_kind_name_key') THEN
    ALTER TABLE message_templates ADD CONSTRAINT message_templates_user_kind_name_key UNIQUE (user_id, kind, name);
  END IF;
END $$;
