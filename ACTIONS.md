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

<<<<<<< HEAD
## 2. Merge the three open pull requests, then update the Render database

[Timowhit/Wedding#20](https://github.com/Timowhit/Wedding/pull/20) is merged. Merge these next, in this order, each once its checks have passed. If GitHub says one has a conflict after you merge the one before, tell me and I'll fix it.

1. [Timowhit/Wedding#21](https://github.com/Timowhit/Wedding/pull/21): budget categories and the printable schedule
2. [Timowhit/Wedding#22](https://github.com/Timowhit/Wedding/pull/22): venue rooms and the inventory
3. [Timowhit/Wedding#23](https://github.com/Timowhit/Wedding/pull/23): the playground, the DJ page, custom fields, whole-wedding templates, French and Portuguese

Then, straight away (some pages show an error until this has run), on your computer, in the project folder, with `.env` pointing at Render:

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm run migrate
```

This adds migrations `017` to `021`. Then delete the branches `follow-ups`, `budget-print`, `layout-rooms` and `next-features` on GitHub.

## 3. Have the French and Portuguese checked

I wrote the French and Brazilian Portuguese translations. Before you advertise them, ask a native speaker of each to click through the app (choose the language at the bottom of any page) and send me anything that reads oddly. The text lives in `src/i18n/fr.js` and `src/i18n/pt.js`.

## 4. Check that PDFs open in your browsers

Files are downloaded in a locked-down mode so nothing in them can run on the site. Open a PDF from **Event day → Files** in each browser you use (Chrome, Firefox, Safari, and on your phone). It should either show the PDF or download it. If one shows an empty or blocked page instead, tell me which browser.

## 5. Keep an eye on file storage

Uploaded files are stored in your Render database. Each wedding can use up to 250 MB, and each person can upload up to 1 GB in total. Render shows the database size on the database's page. If you get close to your plan's limit, tell me and I'll move files to cheaper storage.

Playground trials are small and are deleted after a day without use, whenever someone starts a new trial. If you want them cleared even when nobody starts one, add a daily Render Cron Job running `npm run cleanup-trials` (optional).
=======
## 2. Keep an eye on file storage

Uploaded files are stored in your Render database. Each wedding can use up to 250 MB, and each person can upload up to 1 GB in total. Render shows the database size on the database's page. If you get close to your plan's limit, tell me and I'll move files to cheaper storage.

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
>>>>>>> origin/main
