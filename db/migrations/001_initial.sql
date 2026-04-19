-- ============================================================
--  Forever Planner — initial schema
--  Run via: node db/migrate.js
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT,
  wedding_date  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── budget_items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_limits (
  user_id     UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── checklist_tasks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  due_date    DATE,
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── checklist_tasks Constraint ───────────────────────────────
ALTER TABLE checklist_tasks 
  ADD CONSTRAINT uq_task_user_text UNIQUE (user_id, text);

-- ── guests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  rsvp        TEXT        NOT NULL DEFAULT 'Pending'
                CHECK (rsvp IN ('Pending','Confirmed','Declined')),
  diet        TEXT,
  plus_one    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── vendors ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  status      TEXT        NOT NULL DEFAULT 'Researching'
                CHECK (status IN ('Researching','Contacted','Booked','Declined')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── music_playlists ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_tracks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section      TEXT        NOT NULL,
  track_id     TEXT        NOT NULL,
  track_name   TEXT        NOT NULL,
  artist_name  TEXT,
  artwork_url  TEXT,
  preview_url  TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, section, track_id)
);

-- ── inspiration_board ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspiration_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id    TEXT        NOT NULL,
  thumb_url   TEXT        NOT NULL,
  full_url    TEXT        NOT NULL,
  alt_desc    TEXT,
  source_link TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, photo_id)
);

-- ── refresh_tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_budget_items_user   ON budget_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user          ON checklist_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_guests_user         ON guests(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user        ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_music_user_section  ON music_tracks(user_id, section);
CREATE INDEX IF NOT EXISTS idx_inspo_user          ON inspiration_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user        ON refresh_tokens(user_id);

-- ── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','budget_items','budget_limits','checklist_tasks',
    'guests','vendors'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;
