import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutDb, startTestApp } from '../helpers/app.js';

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
});
