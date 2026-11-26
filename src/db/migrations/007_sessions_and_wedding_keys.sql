-- ============================================================
--  007: server-rendered app (v2)
--  * session table for connect-pg-simple (logins now live in Postgres, not in a JWT)
--  * foreign keys from every feature table to weddings, so deleting a wedding removes its
--    data instead of leaving orphans
--  Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR      NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- NOT VALID: the constraint is enforced for every new or changed row immediately, but existing
-- rows are not checked, so this migration cannot fail on an older database that already holds
-- orphaned rows. Run `ALTER TABLE <table> VALIDATE CONSTRAINT <name>;` later to check them.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'budget_items', 'budget_limits', 'checklist_tasks', 'guests',
    'vendors', 'music_tracks', 'inspiration_photos'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_wedding') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (wedding_id) REFERENCES weddings(id) ON DELETE CASCADE NOT VALID',
        t, 'fk_' || t || '_wedding'
      );
    END IF;
  END LOOP;
END $$;
