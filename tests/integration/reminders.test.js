import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';
import { unsubscribeToken } from '../../src/utils/unsubscribe.js';

const TODAY = '2027-03-15';

describe('reminders', { skip: skipWithoutDb }, () => {
    let app;
    let m;

    const q = (sql, params) => app.pool.query(sql, params);
    const newUser = async (email, { language = 'en', type = 'couple' } = {}) =>
        (
            await q(
                `INSERT INTO users (email, display_name, language, account_type) VALUES ($1, $2, $3, $4) RETURNING id;`,
                [email, email.split('@')[0], language, type]
            )
        ).rows[0].id;
    const newWedding = async (name, { managed = false } = {}) =>
        (await q('INSERT INTO weddings (name, planner_managed) VALUES ($1, $2) RETURNING id;', [name, managed])).rows[0]
            .id;
    const join = (weddingId, userId, role) =>
        q('INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, $3);', [weddingId, userId, role]);
    const vendor = async (weddingId, name, status = 'Booked') =>
        (
            await q(`INSERT INTO vendors (wedding_id, name, status) VALUES ($1, $2, $3) RETURNING id;`, [
                weddingId,
                name,
                status
            ])
        ).rows[0].id;
    const payment = (weddingId, vendorId, amount, due, paid = null) =>
        q(
            'INSERT INTO vendor_payments (wedding_id, vendor_id, amount, due_date, paid_on) VALUES ($1, $2, $3, $4, $5);',
            [weddingId, vendorId, amount, due, paid]
        );
    const task = (weddingId, text, due, done = false) =>
        q('INSERT INTO checklist_tasks (wedding_id, text, due_date, done) VALUES ($1, $2, $3, $4);', [
            weddingId,
            text,
            due,
            done
        ]);
    const decision = (weddingId, title, status) =>
        q('INSERT INTO decisions (wedding_id, title, status) VALUES ($1, $2, $3);', [weddingId, title, status]);

    let planner;
    let couple;
    let ana;
    let mia;

    before(async () => {
        app = await startTestApp();
        m = await import('../../src/models/reminders.js');
        planner = await newUser('planner@example.com', { type: 'planner' });
        couple = await newUser('couple@example.com', { language: 'es' });
        ana = await newWedding('Ana & Luis', { managed: true });
        mia = await newWedding('Mia & Theo', { managed: true });
        await join(ana, planner, 'owner');
        await join(ana, couple, 'client');
        await join(mia, planner, 'viewer');

        const florist = await vendor(ana, 'Bloom & Blossom');
        await payment(ana, florist, 300, '2027-03-10'); // overdue
        await payment(ana, florist, 200, '2027-03-22'); // in 7 days
        await payment(ana, florist, 100, '2027-03-23'); // 8 days: out
        await payment(ana, florist, 50, '2027-03-12', '2027-03-12'); // paid
        const maybe = await vendor(ana, 'Maybe Band', 'Contacted');
        await payment(ana, maybe, 999, '2027-03-16'); // not booked
        await task(ana, 'Send invitations', '2027-03-14');
        await task(ana, 'Book cake tasting', '2027-03-20');
        await task(ana, 'Done already', '2027-03-14', true);
        await task(ana, 'Far away', '2027-06-01');
        await decision(ana, 'Choose the music', 'open');
        await decision(ana, 'Menu', 'changes_requested');
        await decision(ana, 'Flowers', 'approved');

        const miaVendor = await vendor(mia, 'Sweet Cakes');
        await payment(mia, miaVendor, 80, '2027-03-10');
        await task(mia, 'Mia task', '2027-03-14');
    });
    after(() => app?.close());

    describe('digest', () => {
        it('digest covers the next 7 days and anything overdue, booked unpaid payments only', async () => {
            const digest = await m.findReminderDigest(planner, TODAY);
            assert.deepEqual(
                digest.map((w) => w.name),
                ['Ana & Luis']
            );
            const [wedding] = digest;
            assert.deepEqual(
                wedding.payments.map((p) => [p.vendor_name, p.amount, p.overdue]),
                [
                    ['Bloom & Blossom', 300, true],
                    ['Bloom & Blossom', 200, false]
                ]
            );
            assert.deepEqual(
                wedding.tasks.map((t) => [t.text, t.overdue]),
                [
                    ['Send invitations', true],
                    ['Book cake tasting', false]
                ]
            );
        });

        it('viewers get nothing for that wedding', async () => {
            const names = (await m.findReminderDigest(planner, TODAY)).map((w) => w.name);
            assert.ok(!names.includes('Mia & Theo'));
        });

        it('decisions follow who answers and who asks', async () => {
            const [plannerSide] = await m.findReminderDigest(planner, TODAY);
            assert.deepEqual(
                plannerSide.decisions.map((d) => [d.title, d.status]),
                [['Menu', 'changes_requested']]
            );
            const [coupleSide] = await m.findReminderDigest(couple, TODAY);
            assert.deepEqual(
                coupleSide.decisions.map((d) => [d.title, d.status]),
                [['Choose the music', 'open']]
            );
        });

        it('candidates skip switched-off and already-reminded people', async () => {
            const off = await newUser('off@example.com');
            await q('UPDATE users SET reminder_emails = FALSE WHERE id = $1;', [off]);
            const done = await newUser('done@example.com');
            await join(ana, done, 'editor');
            await m.markReminded(done, TODAY);
            const emails = (await m.findReminderCandidates(TODAY)).map((u) => u.email);
            assert.ok(emails.includes('planner@example.com'));
            assert.ok(!emails.includes('off@example.com'));
            assert.ok(!emails.includes('done@example.com'));
            assert.ok((await m.findReminderCandidates('2027-03-16')).some((u) => u.email === 'done@example.com'));
        });
    });

    describe('daily run', () => {
        let run;
        const capture = () => {
            const sent = [];
            return { sent, send: async (message) => sent.push(message) };
        };
        const quiet = { info() {}, warn() {}, error() {} };

        before(async () => {
            ({ runReminders: run } = await import('../../src/services/reminders.js'));
            const evil = await vendor(ana, '<script>alert(1)</script>');
            await payment(ana, evil, 10, '2027-03-15');
        });

        it('sends one digest to each person with something due, in their language, with names escaped', async () => {
            const { sent, send } = capture();
            const result = await run({ today: TODAY, send, log: quiet });
            const to = sent.map((message) => message.to).sort();
            assert.deepEqual(to, ['couple@example.com', 'planner@example.com']);
            assert.equal(result.sent, 2);

            const english = sent.find((message) => message.to === 'planner@example.com');
            assert.equal(english.lang, 'en');
            assert.match(english.subject, /need attention/);
            assert.match(english.text, /Bloom & Blossom/);
            assert.match(english.text, /Ana & Luis/);
            assert.match(english.html, /Bloom &amp; Blossom/);
            assert.match(english.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
            assert.doesNotMatch(english.html, /<script>/);
            assert.match(english.unsubscribeUrl, /\/reminders\/unsubscribe\?u=[0-9a-f-]{36}&t=[0-9a-f]{64}$/);

            const spanish = sent.find((message) => message.to === 'couple@example.com');
            assert.equal(spanish.lang, 'es');
            assert.match(spanish.text, /Choose the music/);
            assert.doesNotMatch(spanish.subject, /need attention/);
        });

        it('a second run the same day sends nothing', async () => {
            const { sent, send } = capture();
            await run({ today: TODAY, send, log: quiet });
            assert.equal(sent.length, 0);
        });

        it("one failure doesn't stop the rest and isn't marked", async () => {
            const tomorrow = '2027-03-16';
            const sent = [];
            const send = async (message) => {
                if (message.to === 'planner@example.com') throw new Error('mailbox unavailable');
                sent.push(message);
            };
            const result = await run({ today: tomorrow, send, log: quiet });
            const to = sent.map((message) => message.to);
            assert.ok(to.includes('couple@example.com'), 'the others still get theirs');
            assert.ok(!to.includes('planner@example.com'));
            assert.equal(result.failed, 1);
            const { rows } = await q(
                `SELECT reminders_sent_on::text AS day FROM users WHERE email = 'planner@example.com';`
            );
            assert.equal(rows[0].day, TODAY, 'not marked for the failed day, so it is retried');
        });

        it('switched-off people get nothing', async () => {
            await q(`UPDATE users SET reminder_emails = FALSE WHERE email = 'couple@example.com';`);
            const { sent, send } = capture();
            await run({ today: '2027-03-17', send, log: quiet });
            assert.ok(!sent.some((message) => message.to === 'couple@example.com'));
            await q(`UPDATE users SET reminder_emails = TRUE WHERE email = 'couple@example.com';`);
        });

        it('without SMTP the default sender marks nobody', async () => {
            const saved = process.env.SMTP_HOST;
            delete process.env.SMTP_HOST;
            try {
                const result = await run({ today: '2027-03-18', log: quiet });
                assert.equal(result.sent, 0);
                assert.equal(result.configured, false);
                const { rows } = await q(
                    `SELECT COUNT(*)::int AS n FROM users WHERE reminders_sent_on = '2027-03-18';`
                );
                assert.equal(rows[0].n, 0);
            } finally {
                if (saved !== undefined) process.env.SMTP_HOST = saved;
            }
        });
    });

    describe('settings and unsubscribe', () => {
        const remindersOn = async (email) =>
            (await q('SELECT reminder_emails FROM users WHERE email = $1;', [email])).rows[0].reminder_emails;

        it('the settings switch turns reminders off and on', async () => {
            const person = await registeredClient(app.baseUrl, 'Rae', 'rae@example.com');
            const page = (await person.get('/settings')).body;
            assert.match(page, /id="reminders-heading"/);
            assert.match(page, /name="reminder_emails"[^>]*checked/);
            await person.post('/settings/reminders', {});
            assert.equal(await remindersOn('rae@example.com'), false);
            assert.doesNotMatch((await person.get('/settings')).body, /name="reminder_emails"[^>]*checked/);
            await person.get('/settings');
            await person.post('/settings/reminders', { reminder_emails: 'on' });
            assert.equal(await remindersOn('rae@example.com'), true);
        });

        it('unsubscribe link: GET asks, POST switches off, without signing in or a CSRF token', async () => {
            const visitor = new TestClient(app.baseUrl);
            const url = `/reminders/unsubscribe?u=${planner}&t=${unsubscribeToken(planner)}`;
            const confirm = await visitor.get(url);
            assert.equal(confirm.status, 200);
            assert.match(confirm.body, /<form method="post"/);
            assert.equal(await remindersOn('planner@example.com'), true, 'a GET changes nothing');
            const done = await visitor.post(url, { 'List-Unsubscribe': 'One-Click' });
            assert.equal(done.status, 200);
            assert.equal(await remindersOn('planner@example.com'), false);
            await q('UPDATE users SET reminder_emails = TRUE WHERE id = $1;', [planner]);
        });

        it("a forged token or another user's id gives 404", async () => {
            const visitor = new TestClient(app.baseUrl);
            const forged = `/reminders/unsubscribe?u=${planner}&t=${'0'.repeat(64)}`;
            assert.equal((await visitor.get(forged)).status, 404);
            assert.equal((await visitor.post(forged, {})).status, 404);
            const swapped = `/reminders/unsubscribe?u=${couple}&t=${unsubscribeToken(planner)}`;
            assert.equal((await visitor.post(swapped, {})).status, 404);
            assert.equal((await visitor.get('/reminders/unsubscribe?u=nope&t=nope')).status, 404);
            assert.equal(await remindersOn('planner@example.com'), true);
            assert.equal(await remindersOn('couple@example.com'), true);
        });
    });
    describe('review fixes', () => {
        it('weddings that ended more than 30 days ago stop sending', async () => {
            const person = await newUser('past@example.com');
            const ended = await newWedding('Long done');
            const recent = await newWedding('Just married');
            await q(`UPDATE weddings SET wedding_date = '2027-01-01' WHERE id = $1;`, [ended]);
            await q(`UPDATE weddings SET wedding_date = '2027-03-01' WHERE id = $1;`, [recent]);
            await join(ended, person, 'owner');
            await join(recent, person, 'owner');
            await task(ended, 'Old thank-you cards', '2027-01-20');
            await task(recent, 'Thank-you cards', '2027-03-10');
            const names = (await m.findReminderDigest(person, TODAY)).map((w) => w.name);
            assert.deepEqual(names, ['Just married']);
        });

        it("in a couple's own wedding nobody is asked to answer their own question", async () => {
            const asker = await newUser('asker@example.com');
            const partner = await newUser('partner@example.com');
            const own = await newWedding('Our own wedding');
            await join(own, asker, 'owner');
            await join(own, partner, 'editor');
            await q(
                `INSERT INTO decisions (wedding_id, title, status, created_by) VALUES ($1, 'Pick the cake', 'open', $2);`,
                [own, asker]
            );
            const titles = async (user) =>
                (await m.findReminderDigest(user, TODAY)).flatMap((w) => w.decisions.map((d) => d.title));
            assert.deepEqual(await titles(asker), []);
            assert.deepEqual(await titles(partner), ['Pick the cake']);
        });
    });
});
