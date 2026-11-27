import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('event-day schedule', { skip: skipWithoutDb }, () => {
    let app;
    let couple;
    let vendorId;
    const itemId = async (title) =>
        (await app.pool.query('SELECT id FROM schedule_items WHERE title = $1;', [title])).rows[0]?.id;

    before(async () => {
        app = await startTestApp();
        couple = await registeredClient(app.baseUrl, 'Eva', 'eva@example.com');
        await couple.get('/vendors');
        await couple.post('/vendors', {
            name: 'DJ Nova',
            category: 'DJ / Band',
            status: 'Booked',
            phone: '(555) 010-7788'
        });
        vendorId = (await app.pool.query(`SELECT id FROM vendors WHERE name = 'DJ Nova';`)).rows[0].id;
    });
    after(() => app?.close());

    it('adds items and shows them in time order with vendor contacts', async () => {
        await couple.get('/schedule');
        const first = await couple.post('/schedule', {
            starts_at: '15:00',
            ends_at: '15:45',
            title: 'Ceremony',
            location: 'Rose garden',
            vendor_id: vendorId,
            contact: '',
            notes: 'Chairs set by 14:00',
            contingency: 'Move into the barn if it rains'
        });
        assert.equal(first.location, '/schedule');
        await couple.post('/schedule', { starts_at: '13:30', title: 'Hair and makeup', vendor_id: '' });

        const page = await couple.get('/schedule');
        assert.ok(page.body.indexOf('Hair and makeup') < page.body.indexOf('Ceremony'), 'sorted by start time');
        assert.match(page.body, /href="tel:5550107788"/);
        assert.match(page.body, /DJ Nova/);
        assert.match(page.body, /Move into the barn if it rains/);
        assert.match(page.body, /3:00\s?PM/);
    });

    it("shows the vendor's included items, open in the print view", async () => {
        await app.pool.query(
            `UPDATE vendors SET contract_includes = 'Four hours of music and a ceremony mic' WHERE id = $1;`,
            [vendorId]
        );
        const page = (await couple.get('/schedule')).body;
        assert.match(page, /<details class="timeline__includes">\s*<summary>What&#39;s included<\/summary>/);
        assert.match(page, /Four hours of music and a ceremony mic/);
        assert.equal((page.match(/timeline__includes/g) ?? []).length, 1, 'only the item linked to the vendor');
        const print = (await couple.get('/schedule?print=1')).body;
        assert.match(print, /<details class="timeline__includes" open>/);
        await app.pool.query('UPDATE vendors SET contract_includes = NULL WHERE id = $1;', [vendorId]);
    });

    it('rejects bad times and vendors from another wedding', async () => {
        await couple.get('/schedule');
        assert.equal((await couple.post('/schedule', { starts_at: '25:00', title: 'Late' })).status, 400);
        assert.equal(
            (await couple.post('/schedule', { starts_at: '18:00', ends_at: '17:00', title: 'Backwards' })).status,
            400
        );
        assert.equal((await couple.post('/schedule', { starts_at: '', title: 'No time' })).status, 400);

        const other = await registeredClient(app.baseUrl, 'Ike', 'ike@example.com');
        await other.get('/schedule');
        const forged = await other.post('/schedule', { starts_at: '12:00', title: 'Forged', vendor_id: vendorId });
        assert.equal(forged.status, 400);
        assert.equal(await itemId('Forged'), undefined);
    });

    it('edits and deletes items; deleting the vendor clears the link', async () => {
        const id = await itemId('Hair and makeup');
        await couple.get(`/schedule/${id}/edit`);
        const saved = await couple.post(`/schedule/${id}/edit`, {
            starts_at: '13:00',
            title: 'Hair & makeup',
            location: 'Bridal suite'
        });
        assert.equal(saved.location, '/schedule');
        assert.match((await couple.get('/schedule')).body, /Bridal suite/);

        await couple.get('/vendors');
        await couple.post(`/vendors/${vendorId}/delete`);
        const ceremony = await app.pool.query(`SELECT vendor_id FROM schedule_items WHERE title = 'Ceremony';`);
        assert.equal(ceremony.rows[0].vendor_id, null);

        await couple.get('/schedule');
        await couple.post(`/schedule/${id}/delete`);
        assert.equal(await itemId('Hair & makeup'), undefined);
    });

    it('has a printable version without navigation', async () => {
        const print = await couple.get('/schedule?print=1');
        assert.equal(print.status, 200);
        assert.match(print.body, /<body class="print-view"[ >]/);
        assert.doesNotMatch(print.body, /id="site-nav"/);
        assert.match(print.body, /Ceremony/);
    });

    it('another wedding cannot edit or delete these items', async () => {
        const other = await registeredClient(app.baseUrl, 'Jo', 'jo@example.com');
        const id = await itemId('Ceremony');
        await other.get('/schedule');
        assert.equal((await other.get(`/schedule/${id}/edit`)).status, 404);
        assert.equal((await other.post(`/schedule/${id}/delete`)).status, 404);
    });
});
