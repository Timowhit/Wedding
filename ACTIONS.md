# Your to-do list

Things only you can do. I remove each one once it's done, so everything here is still open. Follow this file, not older instructions in the chat.

Nothing here stops me building; step 2 only holds back file uploads.

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

## 2. Choose where uploaded files are stored (needed before I build file uploads)

The next big item in `notes.txt` is uploading contracts, floor plans and inspiration photos. Render's own disk is wiped on every deploy, so files must live somewhere else. Pick one and tell me in the chat:

- **A. In your PostgreSQL database (my recommendation to start).** Nothing new to sign up for. I'd cap files at 10 MB each and 250 MB per wedding. The catch: files count toward your Render database's storage, and a bigger database plan costs more once you have many weddings.
- **B. Cloudflare R2 (best for growth).** Cheap object storage with a free tier of 10 GB. You create an account and a bucket and give me the keys through the secure form I'd send. I'd set it up so files can be moved there later from option A.
- **C. Skip uploads for now.** Keep using links to Google Drive or Dropbox, as contracts already do.

Until you answer, I'll keep building the other items.

## 3. Merge the planning details release

[PR link added when it opens] adds:

- task priorities and owners
- guest meals and access needs
- the calendar and search
- the post-event wrap-up

Status: **not ready yet** (final review in progress). When this says ready:

1. Open the PR, click **Ready for review**, wait for the CI check to turn green, then **Merge pull request**.
2. On your computer, in the project folder, with `.env` pointing at Render:

   ```bash
   git checkout main
   ```

   ```bash
   git pull origin main
   ```

   ```bash
   npm run migrate
   ```

   It applies `013_planning_details.sql` and `014_wrap_up.sql`, which only add columns.

3. Delete the `planning-details` branch on GitHub.
