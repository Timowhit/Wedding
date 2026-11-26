-- Allow invited_email to be NULL for shareable link invites
-- (email-specific invites remain unchanged)
ALTER TABLE wedding_invites ALTER COLUMN invited_email DROP NOT NULL;