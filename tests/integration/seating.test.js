import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('seating chart', { skip: skipWithoutDb }, () => {
    let app;
    let couple;
    const guestId = async (name) => (await app.pool.query('SELECT id FROM guests WHERE name = $1;', [name])).rows[0].id;
    const tableId = async (name) =>
        (await app.pool.query('SELECT id FROM seating_tables WHERE name = $1;', [name])).rows[0]?.id;
    const tableOf = async (name) =>
        (await app.pool.query('SELECT table_id FROM guests WHERE name = $1;', [name])).rows[0].table_id;
    // The seats line of one table card, e.g. "2 of 4 seats".
    const seatsLine = (body, table) =>
        body.match(new RegExp(`${table}</h3>\\s*<p class="table-card__seats[^"]*">([^<]+)<`))?.[1].trim();

    before(async () => {
        app = await startTestApp();
        couple = await registeredClient(app.baseUrl, 'Sol', 'sol@example.com');
        await couple.get('/guests');
        await couple.post('/guests', { name: 'Ann', rsvp: 'Confirmed', plus_one: 'Bo', group_name: "Bride's family" });
        await couple.post('/guests', { name: 'Cy', rsvp: 'Pending', group_name: 'Friends' });
        await couple.post('/guests', { name: 'Dee', rsvp: 'Declined', group_name: 'Friends' });
        await couple.post('/guests', { name: 'Eli', rsvp: 'Confirmed' });
    });
    after(() => app?.close());

    it('guest groups are saved and shown on the guest list', async () => {
        const row = await app.pool.query(`SELECT group_name FROM guests WHERE name = 'Ann';`);
        assert.equal(row.rows[0].group_name, "Bride's family");
        assert.match((await couple.get('/guests')).body, /Bride&#39;s family/);
    });

    it('creates tables and validates them', async () => {
        await couple.get('/seating');
        assert.equal((await couple.post('/seating/tables', { name: 'Table 1', seats: '4' })).location, '/seating');
        assert.equal(
            (await couple.post('/seating/tables', { name: 'Table 1', seats: '4' })).status,
            400,
            'duplicate name'
        );
        assert.equal((await couple.post('/seating/tables', { name: 'Big', seats: '31' })).status, 400);
        assert.equal((await couple.post('/seating/tables', { name: 'None', seats: '0' })).status, 400);
        assert.equal((await couple.post('/seating/tables', { name: '', seats: '4' })).status, 400);
    });

    it('seats guests, counting plus-ones, and leaves declined guests out', async () => {
        const t1 = await tableId('Table 1');
        await couple.get('/seating');
        assert.equal(
            (await couple.post(`/seating/guests/${await guestId('Ann')}`, { table_id: t1 })).location,
            '/seating'
        );
        await couple.post(`/seating/guests/${await guestId('Eli')}`, { table_id: t1 });
        let page = await couple.get('/seating');
        assert.equal(seatsLine(page.body, 'Table 1'), '3 of 4 seats');

        await couple.post(`/seating/guests/${await guestId('Dee')}`, { table_id: t1 });
        assert.equal(await tableOf('Dee'), null, 'declined guests are not seated');
        page = await couple.get('/seating');
        assert.doesNotMatch(page.body, /data-guest="Dee"/);
    });

    it('flags tables over capacity', async () => {
        await couple.post('/seating/tables', { name: 'Small', seats: '1' });
        await couple.get('/seating');
        await couple.post(`/seating/guests/${await guestId('Ann')}`, { table_id: await tableId('Small') });
        const page = await couple.get('/seating');
        assert.match(seatsLine(page.body, 'Small'), /2 of 1 seats/);
        assert.match(page.body, /table-card__seats table-card__seats--over/);
    });

    it('filters unseated guests by group and unseats', async () => {
        const page = await couple.get('/seating?group=Friends');
        assert.match(page.body, /data-guest="Cy"/);
        await couple.post(`/seating/guests/${await guestId('Eli')}`, { table_id: '' });
        assert.equal(await tableOf('Eli'), null);
    });

    it('rejects a table from another wedding', async () => {
        const other = await registeredClient(app.baseUrl, 'Uma', 'uma@example.com');
        await other.get('/seating');
        await other.post('/seating/tables', { name: 'Their table', seats: '8' });
        await couple.get('/seating');
        const forged = await couple.post(`/seating/guests/${await guestId('Cy')}`, {
            table_id: await tableId('Their table')
        });
        assert.equal(forged.location, '/seating');
        assert.equal(await tableOf('Cy'), null);
        assert.match((await couple.get('/seating')).body, /That table could not be found/);

        await other.get('/seating');
        assert.equal((await other.post(`/seating/guests/${await guestId('Cy')}`, { table_id: '' })).status, 404);
    });

    it('renames, resizes and deletes tables; deleting unseats its guests', async () => {
        const small = await tableId('Small');
        await couple.get('/seating');
        await couple.post(`/seating/tables/${small}/edit`, { name: 'Head table', seats: '2' });
        let page = await couple.get('/seating');
        assert.equal(seatsLine(page.body, 'Head table'), '2 of 2 seats');
        await couple.post(`/seating/tables/${small}/delete`);
        assert.equal(await tableOf('Ann'), null);
        page = await couple.get('/seating');
        assert.match(page.body, /data-guest="Ann"/);
    });
});
