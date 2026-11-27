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

## 2. Update the Render database

Releases #11, #14 and #15 are merged, and their new columns and tables still need adding on Render: migrations `013` to `016`, which only add things. If you've already run some of them, those are skipped.

On your computer, in the project folder, with `.env` pointing at Render:

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm run migrate
```

Then delete the merged branches on GitHub: `planning-details`, `task-celebrations`, `file-uploads` and `library`.

## 3. Keep an eye on file storage

Uploaded files are stored in your Render database. Each wedding can use up to 250 MB, and each person can upload up to 1 GB in total. Render shows the database size on the database's page. If you get close to your plan's limit, tell me and I'll move files to cheaper storage.

## 4. Reload the site once

[Timowhit/Wedding#17](https://github.com/Timowhit/Wedding/pull/17) is merged. When Render has deployed it, reload the site once in each browser you use. Browsers that still hold the old stylesheet pick up the new one, and from then on every release updates on its own. Then delete the `nav-polish` branch on GitHub.

## 5. Merge the −/+ pill and one-line header

Merge [Timowhit/Wedding#19](https://github.com/Timowhit/Wedding/pull/19) (it includes #18, so merging #19 alone is enough; close #18 if GitHub doesn't close it for you). Then delete the `builder-pills` and `actions-after-17` branches.
