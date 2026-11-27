import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ');

describe('calendar and search', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let zoe;
    let anaWedding;
    let zoeWedding;

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        zoe = await registeredClient(app.baseUrl, 'Zoe', 'zoe@example.com');
        const rows = (
            await app.pool.query(
                `SELECT u.email, wm.wedding_id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
            )
        ).rows;
        anaWedding = rows.find((row) => row.email === 'ana@example.com').wedding_id;
        zoeWedding = rows.find((row) => row.email === 'zoe@example.com').wedding_id;
        const q = (sql, params) => app.pool.query(sql, params);
        await q(`UPDATE weddings SET name = 'Ana and Luis', wedding_date = '2027-06-12' WHERE id = $1;`, [anaWedding]);
        await q(`UPDATE weddings SET name = 'Zoe and Kai', wedding_date = '2027-06-20' WHERE id = $1;`, [zoeWedding]);
        await q(
            `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, done) VALUES
             ($1, 'Send invitations', 'Invitations', '2027-03-05', false),
             ($1, 'Pick a venue', 'Venue', '2027-03-06', true),
             ($2, 'Zoe secret task', 'Other', '2027-03-05', false);`,
            [anaWedding, zoeWedding]
        );
        const vendors = await q(
            `INSERT INTO vendors (wedding_id, name, category, status) VALUES
             ($1, 'Bloom Florals', 'Florist', 'Booked'), ($1, 'Maybe Band', 'Music', 'Contacted')
             RETURNING id, name;`,
            [anaWedding]
        );
        const vendor = Object.fromEntries(vendors.rows.map((row) => [row.name, row.id]));
        await q(
            `INSERT INTO vendor_payments (wedding_id, vendor_id, label, amount, due_date, paid_on) VALUES
             ($1, $2, 'Florist deposit', 500, '2027-03-10', NULL),
             ($1, $2, 'Already paid', 100, '2027-03-11', '2027-01-01'),
             ($1, $3, 'Band quote', 900, '2027-03-12', NULL);`,
            [anaWedding, vendor['Bloom Florals'], vendor['Maybe Band']]
        );
        await q(
            `INSERT INTO decisions (wedding_id, title, due_date, status) VALUES
             ($1, 'Choose the cake flavour', '2027-03-15', 'open'),
             ($1, 'Approved already', '2027-03-16', 'approved');`,
            [anaWedding]
        );
        await q(`INSERT INTO guests (wedding_id, name, rsvp) VALUES ($1, 'Grandma 100% Rose', 'Confirmed');`, [
            anaWedding
        ]);
        await q(`INSERT INTO schedule_items (wedding_id, starts_at, title) VALUES ($1, '15:00', 'First dance');`, [
            anaWedding
        ]);
    });
    after(() => app?.close());

    describe('calendar', () => {
        it("shows the month's tasks, payments and decisions from the person's weddings only", async () => {
            const page = await ana.get('/calendar?month=2027-03');
            assert.equal(page.status, 200);
            const text = textOf(page.body);
            assert.match(text, /Send invitations/);
            assert.match(text, /Florist deposit/);
            assert.match(text, /Choose the cake flavour/);
            assert.match(text, /Ana and Luis/);
            const theirs = textOf((await zoe.get('/calendar?month=2027-03')).body);
            assert.match(theirs, /Zoe secret task/);
            assert.doesNotMatch(theirs, /Send invitations/);
            for (const hidden of [
                'Pick a venue',
                'Already paid',
                'Band quote',
                'Approved already',
                'Zoe secret task'
            ]) {
                assert.doesNotMatch(text, new RegExp(hidden), hidden);
            }
        });

        it('shows wedding days, and every entry opens its page in its wedding', async () => {
            const page = await ana.get('/calendar?month=2027-06');
            assert.match(textOf(page.body), /Wedding day.*Ana and Luis/);
            const march = await ana.get('/calendar?month=2027-03');
            assert.match(
                march.body,
                new RegExp(
                    `<form method="post" action="/wedding/switch"[^>]*>[^]*?value="${anaWedding}"[^]*?name="return_to" value="/checklist"`
                )
            );
        });

        it('a bad month falls back to this month; the wedding filter narrows it', async () => {
            assert.equal((await ana.get('/calendar?month=2027-13')).status, 200);
            assert.equal((await ana.get('/calendar?month=nope')).status, 200);
            const filtered = textOf((await ana.get(`/calendar?month=2027-03&wedding=${zoeWedding}`)).body);
            assert.doesNotMatch(filtered, /Zoe secret task/, "someone else's wedding id shows nothing of it");
        });

        it('the month grid links each busy day to its entries', async () => {
            const page = await ana.get('/calendar?month=2027-03');
            assert.match(page.body, /href="#day-2027-03-05"/);
            assert.match(page.body, /id="day-2027-03-05"/);
        });
    });

    describe('search', () => {
        it('finds guests, vendors, tasks, decisions and event-day items in the person’s weddings', async () => {
            const text = (q) => ana.get(`/search?q=${encodeURIComponent(q)}`).then((r) => textOf(r.body));
            assert.match(await text('grandma'), /Grandma 100% Rose/);
            assert.match(await text('bloom'), /Bloom Florals/);
            assert.match(await text('invitations'), /Send invitations/);
            assert.match(await text('cake'), /Choose the cake flavour/);
            assert.match(await text('dance'), /First dance/);
            assert.doesNotMatch(await text('secret'), /Zoe secret task/);
        });

        it('needs two characters, and treats % and _ as plain text', async () => {
            assert.match(textOf((await ana.get('/search?q=a')).body), /at least 2 characters/i);
            const percent = textOf((await ana.get('/search?q=100%25')).body);
            assert.match(percent, /Grandma 100% Rose/);
            const underscore = textOf((await ana.get('/search?q=_%25_')).body);
            assert.doesNotMatch(underscore, /Grandma/);
        });
    });
});
