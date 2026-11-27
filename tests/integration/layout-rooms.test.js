import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('venue layout: rooms and the inventory', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let outsider;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);
    const rooms = async () =>
        (
            await q(
                `SELECT id, name, width::float, depth::float, unit FROM venue_rooms WHERE wedding_id = $1 ORDER BY created_at, id;`,
                [weddingId]
            )
        ).rows;
    const piece = async (where) =>
        (
            await q(
                `SELECT i.id, i.room_id, i.x::float, i.y::float, i.width::float, i.depth::float, i.kind, i.table_id
                 FROM layout_items i LEFT JOIN seating_tables t ON t.id = i.table_id
                 WHERE i.wedding_id = $1 AND (i.label = $2 OR t.name = $2);`,
                [weddingId, where]
            )
        ).rows[0];

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Lena', 'lena@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vera', 'vera@example.com');
        outsider = await registeredClient(app.baseUrl, 'Otto', 'otto@example.com');
        weddingId = (
            await q(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'lena@example.com';`
            )
        ).rows[0].wedding_id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'viewer' FROM users WHERE email = 'vera@example.com';`,
            [weddingId]
        );
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        await owner.get('/layout');
    });
    after(() => app?.close());

    it('adds a second room with its own size and unit, shown as a tab', async () => {
        const added = await owner.post('/layout/rooms', { name: 'Terrace', width: '20', depth: '10', unit: 'm' });
        const [main, terrace] = await rooms();
        assert.equal(added.location, `/layout?room=${terrace.id}`);
        assert.deepEqual(
            { name: terrace.name, width: terrace.width, depth: terrace.depth, unit: terrace.unit },
            { name: 'Terrace', width: 20, depth: 10, unit: 'm' }
        );
        const page = (await owner.get(`/layout?room=${terrace.id}`)).body;
        assert.match(page, /<svg class="floor-plan"[^>]*viewBox="0 0 20 10"/);
        assert.match(page, new RegExp(`href="/layout\\?room=${terrace.id}" aria-current="page">Terrace`));
        assert.match(page, /href="\/layout"\s*>Main room</, 'the first room is "Main room"');
        assert.equal(main.name, null);
    });

    it('a fixture goes into the room it was added from', async () => {
        const [main, terrace] = await rooms();
        await owner.post('/layout/items', { room_id: terrace.id, kind: 'bar', label: 'Terrace bar', where: 'room' });
        const bar = await piece('Terrace bar');
        assert.equal(bar.room_id, terrace.id);
        assert.ok(bar.x <= 20 && bar.y <= 10, 'inside the terrace');
        assert.doesNotMatch(
            (await owner.get('/layout')).body,
            /class="piece__label"[^>]*>Terrace bar</,
            'not drawn in the main room'
        );
        assert.equal(main.unit, 'ft');
    });

    it('a piece can be kept in the inventory and placed later, converted to the room’s unit', async () => {
        const [main, terrace] = await rooms();
        await owner.post('/layout/items', { room_id: main.id, kind: 'stage', label: 'Band stage', where: 'inventory' });
        let stage = await piece('Band stage');
        assert.equal(stage.room_id, null, 'off the plan');
        const page = (await owner.get('/layout')).body;
        assert.match(page, /aria-labelledby="inventory-heading"[^]*Band stage/, 'listed in the inventory');
        assert.match(page, new RegExp(`action="/layout/items/${stage.id}/room"`));
        const feet = stage.width;

        await owner.post(`/layout/items/${stage.id}/room`, { room_id: terrace.id });
        stage = await piece('Band stage');
        assert.equal(stage.room_id, terrace.id);
        assert.ok(Math.abs(stage.width - feet / 3.281) <= 0.5, `${feet} ft became ${stage.width} m`);
    });

    it('a piece moves to another room or back to the inventory', async () => {
        const [main] = await rooms();
        const bar = await piece('Terrace bar');
        assert.equal((await owner.post(`/layout/items/${bar.id}/room`, { room_id: main.id })).location, '/layout');
        assert.equal((await piece('Terrace bar')).room_id, main.id);
        await owner.post(`/layout/items/${bar.id}/room`, { room_id: '' });
        assert.equal((await piece('Terrace bar')).room_id, null);
        // Moving on the plan needs a room: an inventory piece can't be dragged.
        assert.equal((await owner.post(`/layout/items/${bar.id}/move`, { x: '5', y: '5' })).status, 302);
        assert.equal((await piece('Terrace bar')).room_id, null);
    });

    it('seating tables wait in the inventory; "Place all" puts them in the room', async () => {
        await owner.get('/seating');
        for (const name of ['Table A', 'Table B', 'Table C']) await owner.post('/seating/tables', { name, seats: '6' });
        const [, terrace] = await rooms();
        const page = (await owner.get(`/layout?room=${terrace.id}`)).body;
        assert.match(page, /action="\/layout\/tables\/all"/);
        await owner.post('/layout/tables/all', { room_id: terrace.id });
        for (const name of ['Table A', 'Table B', 'Table C']) {
            assert.equal((await piece(name)).room_id, terrace.id, name);
        }
        assert.doesNotMatch((await owner.get(`/layout?room=${terrace.id}`)).body, /action="\/layout\/tables\/all"/);
    });

    it('renames and resizes one room without touching the other', async () => {
        const [main, terrace] = await rooms();
        await owner.post('/layout/room', {
            room_id: terrace.id,
            name: 'Roof terrace',
            width: '25',
            depth: '12',
            unit: 'm'
        });
        const [mainAfter, terraceAfter] = await rooms();
        assert.equal(terraceAfter.name, 'Roof terrace');
        assert.equal(terraceAfter.width, 25);
        assert.deepEqual(mainAfter, main);
        assert.equal(terrace.unit, 'm');
    });

    it('deleting a room sends its pieces to the inventory; the last room stays', async () => {
        const [main, terrace] = await rooms();
        const deleted = await owner.post(`/layout/rooms/${terrace.id}/delete`, {});
        assert.equal(deleted.location, '/layout');
        assert.equal((await rooms()).length, 1);
        assert.equal((await piece('Table A')).room_id, null, 'its tables wait in the inventory');
        assert.equal((await piece('Band stage')).room_id, null);
        await owner.post(`/layout/rooms/${main.id}/delete`, {});
        assert.equal((await rooms()).length, 1, 'the last room stays');
        assert.match((await owner.get('/layout')).body, /The last room can’t be deleted/);
    });

    it('viewers see the rooms and inventory but no forms; other weddings get 404', async () => {
        const [main] = await rooms();
        const page = (await viewer.get('/layout')).body;
        assert.match(page, /Inventory/);
        assert.doesNotMatch(page, /action="\/layout\/rooms"/);
        assert.doesNotMatch(page, /Place here/);
        await viewer.post('/layout/rooms', { name: 'Sneaky', width: '10', depth: '10', unit: 'ft' });
        assert.equal((await rooms()).length, 1);

        await outsider.get('/layout');
        assert.equal((await outsider.get(`/layout?room=${main.id}`)).status, 404);
        assert.equal((await outsider.post(`/layout/rooms/${main.id}/delete`, {})).status, 404);
        const bar = await piece('Terrace bar');
        assert.equal((await outsider.post(`/layout/items/${bar.id}/room`, { room_id: '' })).status, 404);
        // An editor can't move a piece into another wedding's room.
        const otherRoom = (
            await q(
                `SELECT r.id FROM venue_rooms r JOIN wedding_members wm ON wm.wedding_id = r.wedding_id
                 JOIN users u ON u.id = wm.user_id WHERE u.email = 'otto@example.com';`
            )
        ).rows[0].id;
        assert.equal((await owner.post(`/layout/items/${bar.id}/room`, { room_id: otherRoom })).status, 404);
        assert.equal((await owner.post('/layout/items', { room_id: otherRoom, kind: 'bar', label: 'x' })).status, 404);
    });
});
