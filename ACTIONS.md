# Your to-do list

Things only you can do. I remove each one once it's done, so everything here is still open. Follow this file, not older instructions in the chat.

Nothing here blocks me. I keep building while these wait.

## 1. Update the Render database

The releases since #3 need new database columns, up to `012_appearance_and_layout.sql` from #9. Running this applies whichever ones are missing. If it prints "Database is up to date", they were already applied.

On your computer, in the project folder, with your `.env` pointing at Render (`DB_URL=…` and `DB_SSL_INSECURE=true`):

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm install
```

```bash
npm run migrate
```

## 2. Set your time zone on Render

On Render, open your web service, then **Environment**, and add `APP_TIME_ZONE` with your zone, for example `America/Denver`. Click **Save changes**.

This makes "today" your day for overdue payments and reminders; without it the app uses UTC. Add the same line to your local `.env`.

## 3. Delete the old branches on GitHub

The releases are all merged into `main`, so these branches are no longer needed:

`planner-release`, `payments-contracts`, `offline-event-day`, `templates`, `reminders`, `revamp/cse340-standards`, `ui/design-review`, `appearance-and-layout`.

On GitHub, go to **Code → Branches** and click the bin icon next to each one.

To clean up your computer as well, run each of these and ignore any "not found" errors:

```bash
git fetch --prune
```

```bash
git branch -D planner-release payments-contracts offline-event-day templates reminders revamp/cse340-standards ui/design-review appearance-and-layout
```

## 4. (Optional) Turn on reminder emails

Without this nothing is sent, and nothing breaks.

1. On Render, open your web service, then **Environment**. Add `SMTP_HOST`, `SMTP_PORT` (usually `587`), `SMTP_USER`, `SMTP_PASS` and `FROM_EMAIL` from your email provider. Resend, Postmark, Brevo and Mailgun all have free tiers. Invite emails start working too.
2. On Render, choose **New → Cron Job**:
   - **Repository:** `Timowhit/Wedding`, branch `main`
   - **Build command:** `npm install`
   - **Command:** `npm run reminders`
   - **Schedule:** `30 14 * * *`. The schedule is in UTC: 14:30 UTC is 7:30 in Denver in winter and 8:30 in summer.
   - **Environment:** the same variables as the web service. At least `DB_URL`, `DB_SSL_INSECURE`, `SESSION_SECRET` (the same value, or unsubscribe links break), `APP_URL`, `APP_TIME_ZONE` and the SMTP settings.
3. Click **Trigger Run** to test it.

Cron Jobs are a paid Render instance type.

## 5. (Optional) Dismiss the GitGuardian warning on #9

GitGuardian flagged two "secrets" in [Timowhit/Wedding#9](https://github.com/Timowhit/Wedding/pull/9). Both are false positives: colour codes in a test, not passwords or keys. To clear them, open the two incidents from the GitGuardian comment on that PR and mark each as **False positive**. Ignoring them is also fine.
