-- ============================================================
--  Forever Planner — Optimized Unified Migration
--  Fixes: Constraint ordering, Redundant drops, Token repair
-- ============================================================

-- 1. Extensions & Utilities
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2. Core Tables (Define with NULLs first)

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  avatar_url    TEXT,
  display_name  TEXT,
  wedding_date  DATE,
  language      TEXT        NOT NULL DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- budget_limits: New PK 'id', user_id/wedding_id nullable
CREATE TABLE IF NOT EXISTS budget_limits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Other feature tables
CREATE TABLE IF NOT EXISTS budget_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  text        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  due_date    DATE,
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  name        TEXT        NOT NULL,
  rsvp        TEXT        NOT NULL DEFAULT 'Pending' CHECK (rsvp IN ('Pending','Confirmed','Declined')),
  diet        TEXT,
  plus_one    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  status      TEXT        NOT NULL DEFAULT 'Researching' CHECK (status IN ('Researching','Contacted','Booked','Declined')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_tracks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,
  wedding_id   UUID,
  section      TEXT        NOT NULL,
  track_id     TEXT        NOT NULL,
  track_name   TEXT        NOT NULL,
  artist_name  TEXT,
  artwork_url  TEXT,
  preview_url  TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspiration_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  wedding_id  UUID,
  photo_id    TEXT        NOT NULL,
  thumb_url   TEXT        NOT NULL,
  full_url    TEXT        NOT NULL,
  alt_desc    TEXT,
  source_link TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Collaboration Tables

CREATE TABLE IF NOT EXISTS weddings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL DEFAULT 'Our Wedding',
  wedding_date DATE,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wedding_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wedding_id, user_id)
);

CREATE TABLE IF NOT EXISTS wedding_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id    UUID        NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  invited_by    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  invited_email TEXT,
  token         TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  role          TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes (Create early for performance during migration)
CREATE INDEX IF NOT EXISTS idx_budget_items_user   ON budget_items(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_wedding ON budget_items(wedding_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user          ON checklist_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wedding       ON checklist_tasks(wedding_id);
CREATE INDEX IF NOT EXISTS idx_guests_user         ON guests(user_id);
CREATE INDEX IF NOT EXISTS idx_guests_wedding      ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user        ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_wedding     ON vendors(wedding_id);
CREATE INDEX IF NOT EXISTS idx_music_user_section  ON music_tracks(user_id, section);
CREATE INDEX IF NOT EXISTS idx_music_wedding       ON music_tracks(wedding_id);
CREATE INDEX IF NOT EXISTS idx_inspo_user          ON inspiration_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_inspo_wedding       ON inspiration_photos(wedding_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user        ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_wedding_members_user    ON wedding_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wedding_members_wedding ON wedding_members(wedding_id);
CREATE INDEX IF NOT EXISTS idx_invites_token           ON wedding_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email           ON wedding_invites(invited_email);

-- 5. Data Migration (Run BEFORE adding unique constraints on wedding_id)
DO $$
DECLARE
  u   RECORD;
  wid UUID;
BEGIN
  FOR u IN SELECT id, display_name, wedding_date FROM users LOOP
    -- Check if user already has a wedding (from previous partial run)
    SELECT wm.wedding_id INTO wid
    FROM   wedding_members wm
    WHERE  wm.user_id = u.id AND wm.role = 'owner'
    LIMIT  1;

    IF wid IS NULL THEN
      -- Create new wedding
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

    -- Migrate data
    -- Note: We assume no duplicate wedding_ids exist in these tables yet.
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

-- 6. Apply Unique Constraints (AFTER migration to prevent violations)
-- Drop old user-based constraints first to be safe
DO $$
BEGIN
  ALTER TABLE checklist_tasks    DROP CONSTRAINT IF EXISTS uq_task_user_text;
  ALTER TABLE music_tracks       DROP CONSTRAINT IF EXISTS music_tracks_user_id_section_track_id_key;
  ALTER TABLE inspiration_photos DROP CONSTRAINT IF EXISTS inspiration_photos_user_id_photo_id_key;
END $$;

-- Add new wedding-based constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_budget_limits_wedding') THEN
    ALTER TABLE budget_limits ADD CONSTRAINT uq_budget_limits_wedding UNIQUE (wedding_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_wedding_text') THEN
    ALTER TABLE checklist_tasks ADD CONSTRAINT uq_task_wedding_text UNIQUE (wedding_id, text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_music_wedding_section_track') THEN
    ALTER TABLE music_tracks ADD CONSTRAINT uq_music_wedding_section_track UNIQUE (wedding_id, section, track_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inspo_wedding_photo') THEN
    ALTER TABLE inspiration_photos ADD CONSTRAINT uq_inspo_wedding_photo UNIQUE (wedding_id, photo_id);
  END IF;
END $$;

-- 7. Triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','budget_items','budget_limits','checklist_tasks',
    'guests','vendors','weddings'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;

-- 8. Fix Corrupt Tokens (Run last)
UPDATE wedding_invites
SET token = gen_random_uuid()::TEXT
WHERE invited_email IS NULL
  AND token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';