-- ============================================================
--  Forever Planner — weddings, OAuth, and invite system
--  FIXED: replaced invalid ADD CONSTRAINT IF NOT EXISTS syntax
--  with DO $$ blocks that check pg_constraint first.
--  Safe to re-run on a database where part of this already ran.
-- ============================================================

-- ── Add OAuth + avatar fields to users ───────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id  TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ── weddings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weddings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL DEFAULT 'Our Wedding',
  wedding_date DATE,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── wedding_members ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wedding_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'editor'
               CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wedding_id, user_id)
);

-- ── wedding_invites ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wedding_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id    UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  invited_by    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  invited_email TEXT        NOT NULL,
  token         TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  role          TEXT        NOT NULL DEFAULT 'editor'
                  CHECK (role IN ('editor', 'viewer')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Add wedding_id to all feature tables ─────────────────────
ALTER TABLE budget_items       ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE budget_limits      ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE checklist_tasks    ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE guests             ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE vendors            ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE music_tracks       ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;
ALTER TABLE inspiration_photos ADD COLUMN IF NOT EXISTS wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE;

-- Unique constraint on budget_limits.wedding_id
-- (ADD CONSTRAINT IF NOT EXISTS is not valid PostgreSQL — use a DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_budget_limits_wedding'
  ) THEN
    ALTER TABLE budget_limits
      ADD CONSTRAINT uq_budget_limits_wedding UNIQUE (wedding_id);
  END IF;
END $$;

-- Update checklist unique constraint to use wedding_id
ALTER TABLE checklist_tasks DROP CONSTRAINT IF EXISTS uq_task_user_text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_wedding_text'
  ) THEN
    ALTER TABLE checklist_tasks
      ADD CONSTRAINT uq_task_wedding_text UNIQUE (wedding_id, text);
  END IF;
END $$;

-- Update music unique constraint to use wedding_id
ALTER TABLE music_tracks DROP CONSTRAINT IF EXISTS music_tracks_user_id_section_track_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_music_wedding_section_track'
  ) THEN
    ALTER TABLE music_tracks
      ADD CONSTRAINT uq_music_wedding_section_track UNIQUE (wedding_id, section, track_id);
  END IF;
END $$;

-- Update inspiration unique constraint to use wedding_id
ALTER TABLE inspiration_photos DROP CONSTRAINT IF EXISTS inspiration_photos_user_id_photo_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_inspo_wedding_photo'
  ) THEN
    ALTER TABLE inspiration_photos
      ADD CONSTRAINT uq_inspo_wedding_photo UNIQUE (wedding_id, photo_id);
  END IF;
END $$;

-- ── Migrate existing data ─────────────────────────────────────
DO $$
DECLARE
  u   RECORD;
  wid UUID;
BEGIN
  FOR u IN SELECT id, display_name, wedding_date FROM users LOOP
    SELECT wm.wedding_id INTO wid
    FROM   wedding_members wm
    WHERE  wm.user_id = u.id AND wm.role = 'owner'
    LIMIT  1;

    IF wid IS NULL THEN
      INSERT INTO weddings (name, wedding_date, created_by)
      VALUES (
        COALESCE(u.display_name || '''s Wedding', 'Our Wedding'),
        u.wedding_date,
        u.id
      )
      RETURNING id INTO wid;

      INSERT INTO wedding_members (wedding_id, user_id, role)
      VALUES (wid, u.id, 'owner');
    END IF;

    UPDATE budget_items       SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE budget_limits      SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE checklist_tasks    SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE guests             SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE vendors            SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE music_tracks       SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
    UPDATE inspiration_photos SET wedding_id = wid WHERE user_id = u.id AND wedding_id IS NULL;
  END LOOP;
END;
$$;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wedding_members_user    ON wedding_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wedding_members_wedding ON wedding_members(wedding_id);
CREATE INDEX IF NOT EXISTS idx_invites_token           ON wedding_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email           ON wedding_invites(invited_email);
CREATE INDEX IF NOT EXISTS idx_budget_items_wedding    ON budget_items(wedding_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wedding           ON checklist_tasks(wedding_id);
CREATE INDEX IF NOT EXISTS idx_guests_wedding          ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_vendors_wedding         ON vendors(wedding_id);
CREATE INDEX IF NOT EXISTS idx_music_wedding           ON music_tracks(wedding_id);
CREATE INDEX IF NOT EXISTS idx_inspo_wedding           ON inspiration_photos(wedding_id);

-- ── updated_at trigger for weddings ──────────────────────────
DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_weddings_updated_at ON weddings;
  CREATE TRIGGER trg_weddings_updated_at
    BEFORE UPDATE ON weddings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END;
$$;
