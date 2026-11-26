-- ============================================================
--  Forever Planner — 006_fix_shareable_invite_token
--
--  Root cause: Invite.createShareLink() had a parameter-order
--  bug that stored the role string (e.g. "editor") into the
--  token column instead of a proper UUID. This caused all
--  shareable invite links to be broken — the token in the URL
--  would never match a valid UUID lookup.
--
--  This migration:
--    1. Identifies rows where token is NOT a valid UUID
--       (i.e. rows written by the buggy createShareLink).
--    2. Replaces those corrupt token values with fresh UUIDs.
--    3. Is idempotent — safe to re-run.
-- ============================================================

UPDATE wedding_invites
SET token = gen_random_uuid()::TEXT
WHERE invited_email IS NULL                    -- shareable link invites only
  AND token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';