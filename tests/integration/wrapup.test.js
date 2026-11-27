import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ');

describe('post-event wrap-up', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let viewer;
    let weddingId;
    let vendorId;
    const q = (sql, params) => app.pool.query(sql, params);

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        const rows = (
            await q(
                `SELECT u.email, u.id, wm.wedding_id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
            )
        ).rows;
        weddingId = rows.find((row) => row.email === 'ana@example.com').wedding_id;
        await q(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'viewer');`, [
            weddingId,
            rows.find((row) => row.email === 'vik@example.com').id
        ]);
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        const vendor = await q(
            `INSERT INTO vendors (wedding_id, name, category, status, contract_total) VALUES ($1, 'Bloom Florals', 'Florist', 'Booked', 1200) RETURNING id;`,
            [weddingId]
        );
        vendorId = vendor.rows[0].id;
        await q(
            `INSERT INTO vendor_payments (wedding_id, vendor_id, label, amount, due_date) VALUES ($1, $2, 'Balance', 700, '2026-01-10');`,
            [weddingId, vendorId]
        );
    });
    after(() => app?.close());

    it('no wrap-up before the wedding; after it, the dashboard shows what is left', async () => {
        await q(`UPDATE weddings SET wedding_date = '2099-06-01' WHERE id = $1;`, [weddingId]);
        assert.doesNotMatch((await ana.get('/')).body, /id="wrapup-heading"/);
        await q(`UPDATE weddings SET wedding_date = '2026-01-03' WHERE id = $1;`, [weddingId]);
        const page = textOf((await ana.get('/')).body);
        assert.match(page, /Wrap-up/);
        assert.match(page, /\$1,200\.00 still owed/);
        assert.match(page, /Rate Bloom Florals/);
    });

    it('wrap-up tasks wait until the wedding has happened', async () => {
        await q(`UPDATE weddings SET wedding_date = '2099-06-01' WHERE id = $1;`, [weddingId]);
        await ana.get('/');
        await ana.post('/checklist/wrap-up', {});
        const none = await q(`SELECT COUNT(*)::int AS n FROM checklist_tasks WHERE wedding_id = $1;`, [weddingId]);
        assert.equal(none.rows[0].n, 0);
        await q(`UPDATE weddings SET wedding_date = '2026-01-03' WHERE id = $1;`, [weddingId]);
    });

    it('adds the wrap-up tasks once, dated after the wedding', async () => {
        await ana.get('/');
        assert.equal((await ana.post('/checklist/wrap-up', {})).location, '/');
        const tasks = await q(
            `SELECT text, to_char(due_date, 'YYYY-MM-DD') AS due FROM checklist_tasks WHERE wedding_id = $1 ORDER BY due_date, text;`,
            [weddingId]
        );
        assert.ok(tasks.rows.length >= 5, 'several wrap-up tasks');
        assert.ok(
            tasks.rows.every((task) => task.due > '2026-01-03'),
            'all after the wedding day'
        );
        assert.ok(tasks.rows.some((task) => /thank-you/i.test(task.text)));
        await ana.post('/checklist/wrap-up', {});
        const again = await q(`SELECT COUNT(*)::int AS n FROM checklist_tasks WHERE wedding_id = $1;`, [weddingId]);
        assert.equal(again.rows[0].n, tasks.rows.length, 'nothing added twice');
        // Someone reading in Spanish doesn't add the same tasks again in Spanish.
        await ana.post('/language', { language: 'es', return_to: '/' });
        await ana.post('/checklist/wrap-up', {});
        await ana.post('/language', { language: 'en', return_to: '/' });
        const spanish = await q(`SELECT COUNT(*)::int AS n FROM checklist_tasks WHERE wedding_id = $1;`, [weddingId]);
        assert.equal(spanish.rows[0].n, tasks.rows.length, 'not added again in another language');
    });

    it('rates a vendor 1 to 5 with a note, shown as stars; viewers cannot rate', async () => {
        await ana.get(`/vendors/${vendorId}`);
        assert.equal((await ana.post(`/vendors/${vendorId}/rating`, { rating: '6', review: '' })).status, 400);
        await viewer.get(`/vendors/${vendorId}`);
        await viewer.post(`/vendors/${vendorId}/rating`, { rating: '1', review: 'Bad' });
        assert.equal((await q(`SELECT rating FROM vendors WHERE id = $1;`, [vendorId])).rows[0].rating, null);
        assert.equal(
            (await ana.post(`/vendors/${vendorId}/rating`, { rating: '4', review: 'Lovely work' })).location,
            `/vendors/${vendorId}`
        );
        const saved = (await q(`SELECT rating, review FROM vendors WHERE id = $1;`, [vendorId])).rows[0];
        assert.deepEqual(saved, { rating: 4, review: 'Lovely work' });
        const vendorPage = textOf((await ana.get(`/vendors/${vendorId}`)).body);
        assert.match(vendorPage, /Saved your rating of Bloom Florals/);
        assert.doesNotMatch(vendorPage, /\{rating\}|\{max\}/, 'no raw placeholders');
        const list = (await ana.get('/vendors')).body;
        assert.match(list, /<span class="visually-hidden">Rated 4 out of 5<\/span>/, 'screen readers hear the rating');
        assert.doesNotMatch(list, /class="stars[^"]*" aria-label/);
        assert.match((await ana.get(`/vendors/${vendorId}`)).body, /1 star</, 'one star, not "1 stars"');
        assert.doesNotMatch(
            textOf((await ana.get('/')).body),
            /Rate Bloom Florals/,
            'rated vendors leave the wrap-up list'
        );
    });

    it('an editor can clear a rating; a viewer cannot', async () => {
        await viewer.get(`/vendors/${vendorId}`);
        await viewer.post(`/vendors/${vendorId}/rating/clear`, {});
        assert.equal((await q(`SELECT rating FROM vendors WHERE id = $1;`, [vendorId])).rows[0].rating, 4);
        const page = (await ana.get(`/vendors/${vendorId}`)).body;
        assert.match(page, /action="\/vendors\/[0-9a-f-]+\/rating\/clear"[^>]*data-confirm="Clear the rating/);
        assert.equal((await ana.post(`/vendors/${vendorId}/rating/clear`, {})).location, `/vendors/${vendorId}`);
        const cleared = (await q(`SELECT rating, review FROM vendors WHERE id = $1;`, [vendorId])).rows[0];
        assert.deepEqual(cleared, { rating: null, review: null });
        assert.match((await ana.get(`/vendors/${vendorId}`)).body, /Rating cleared/);
        assert.doesNotMatch((await ana.get(`/vendors/${vendorId}`)).body, /rating\/clear/, 'nothing left to clear');
        await ana.post(`/vendors/${vendorId}/rating`, { rating: '4', review: 'Lovely work' });
    });

    it('the owner archives the wedding: hidden from active lists and reminders, and can bring it back', async () => {
        await viewer.get('/');
        await viewer.post('/wedding/archive', {});
        const untouched = await q(`SELECT archived_at FROM weddings WHERE id = $1;`, [weddingId]);
        assert.equal(untouched.rows[0].archived_at, null, 'only the owner can archive');
        await ana.get('/');
        assert.equal((await ana.post('/wedding/archive', {})).location, '/');
        assert.match(textOf((await ana.get('/')).body), /This wedding is archived/);
        const { findReminderDigest } = await import('../../src/models/reminders.js');
        const anaId = (await q(`SELECT id FROM users WHERE email = 'ana@example.com';`)).rows[0].id;
        assert.deepEqual(await findReminderDigest(anaId, '2026-01-10'), [], 'no reminders for an archived wedding');
        const { findPlannerPaymentsDue, countPlannerOverdue } = await import('../../src/models/payments.js');
        const { findPlannerWorkload } = await import('../../src/models/planner.js');
        assert.deepEqual(await findPlannerPaymentsDue(anaId, { filter: 'overdue', today: '2026-02-01' }), []);
        assert.equal(await countPlannerOverdue(anaId, '2026-02-01'), 0);
        assert.equal((await findPlannerWorkload(anaId)).overdueTasks, 0, 'archived tasks are not counted');
        await ana.post('/wedding/unarchive', {});
        assert.ok((await countPlannerOverdue(anaId, '2026-02-01')) > 0, 'counted again once back');
        assert.doesNotMatch(textOf((await ana.get('/')).body), /This wedding is archived/);
    });
});
