-- ============================================================
--  011: reminders
--  A daily summary email (scripts/send-reminders.js), on unless the person switches it off.
--  reminders_sent_on keeps it to one per person per day.
--  Only adds things. Safe to run more than once.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_emails   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_sent_on DATE;
