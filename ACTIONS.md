# Your to-do list

Things only you can do. I remove each one once it's done, so everything here is still open. Follow this file, not older instructions in the chat.

Nothing here stops me building.

## 1. (Optional) Turn on reminder emails

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

## 2. Keep an eye on file storage

Uploaded files are stored in your Render database. Each wedding can use up to 250 MB, and each person can upload up to 1 GB in total. Render shows the database size on the database's page. If you get close to your plan's limit, tell me and I'll move files to cheaper storage.

<<<<<<< HEAD

## Merge the budget categories and printable schedule

When [Timowhit/Wedding#21](https://github.com/Timowhit/Wedding/pull/21) passes its checks, merge it, then run `npm run migrate` against Render as in the step above (it adds migration `018`, each wedding's budget categories). Then delete the `budget-print` branch.

## Merge the venue rooms and inventory

When [Timowhit/Wedding#22](https://github.com/Timowhit/Wedding/pull/22) passes its checks, merge it, then run `npm run migrate` against Render straight away: the venue layout page shows an error until it has run. It adds migration `019`, which turns each wedding's current floor plan into its "Main room", with its pieces in it. Then delete the `layout-rooms` branch.
=======

## 3. Merge the follow-ups, then update the Render database

When [Timowhit/Wedding#20](https://github.com/Timowhit/Wedding/pull/20) passes its checks, merge it. Then, on your computer, in the project folder, with `.env` pointing at Render:

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm run migrate
```

This adds migration `017`: it remembers which checklist milestones each wedding has celebrated, and makes message names unique without regard to capital letters. Then delete the `follow-ups` branch on GitHub.

## 4. Check that PDFs open in your browsers

Files are downloaded in a locked-down mode so nothing in them can run on the site. Open a PDF from **Event day → Files** in each browser you use (Chrome, Firefox, Safari, and on your phone). It should either show the PDF or download it. If one shows an empty or blocked page instead, tell me which browser.

> > > > > > > origin/follow-ups
