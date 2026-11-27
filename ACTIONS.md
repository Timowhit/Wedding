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

## 2. Update the Render database for #11

[Timowhit/Wedding#11](https://github.com/Timowhit/Wedding/pull/11) is merged. Its new columns still need adding on Render. On your computer, in the project folder, with `.env` pointing at Render:

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm run migrate
```

It applies `013_planning_details.sql` and `014_wrap_up.sql`, which only add columns. Then delete the `planning-details` and `task-celebrations` branches on GitHub.

## 3. Merge the file uploads release

[Timowhit/Wedding#14](https://github.com/Timowhit/Wedding/pull/14) adds the Files page and files on vendor pages, stored in your PostgreSQL database as you chose. It has had a security review and the fixes are in. Ready to merge.

1. Open the PR, click **Ready for review**, wait for the CI check, then **Merge pull request**.
2. Pull `main` and run `npm run migrate` again, as in step 2. It adds `015_files.sql`.
3. Keep an eye on your Render database's storage. Each wedding can use up to 250 MB of files, and each person can upload up to 1 GB in total across their weddings. Render shows the database size on the database's page. If you get close to your plan's limit, tell me and I'll move files to cheaper storage.

## 4. Merge the messages and questionnaires library (after step 3)

[Timowhit/Wedding#15](https://github.com/Timowhit/Wedding/pull/15) adds your message templates and questionnaires (`/library`) and the Questionnaires page couples answer. It has been reviewed and the review's fixes are in. It is built on top of the file uploads PR, so merge that first; if GitHub then shows a conflict here, tell me and I'll update it.

1. Merge the PR once its CI check is green.
2. Pull `main` and run `npm run migrate` (adds `016_library.sql`).
