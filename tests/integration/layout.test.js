import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('venue layout', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let outsider;
    let weddingId;
    const items = async () =>
        (
            await app.pool.query(
                `SELECT id, kind, label, table_id, shape, x::float, y::float, width::float, depth::float, rotation
                 FROM layout_items WHERE wedding_id = $1 ORDER BY created_at, id;`,
                [weddingId]
            )
        ).rows;
    const room = async () =>
        (
            await app.pool.query(`SELECT width::float, depth::float, unit FROM venue_layouts WHERE wedding_id = $1;`, [
                weddingId
            ])
        ).rows[0];
    const jsonPost = (client, path, fields) =>
        client.request(path, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
            body: new URLSearchParams({ _csrf: client.csrfToken, ...fields })
        });

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Lena', 'lena@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vera', 'vera@example.com');
        outsider = await registeredClient(app.baseUrl, 'Otto', 'otto@example.com');
        const rows = (
            await app.pool.query(
                `SELECT u.email, u.id, wm.wedding_id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
            )
        ).rows;
        const byEmail = Object.fromEntries(rows.map((row) => [row.email, row]));
        weddingId = byEmail['lena@example.com'].wedding_id;
        await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'viewer');`, [
            weddingId,
            byEmail['vera@example.com'].id
        ]);
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
    });
    after(() => app?.close());

    it('starts with a 60 × 40 ft room drawn to scale', async () => {
        const page = await owner.get('/layout');
        assert.equal(page.status, 200);
        assert.match(page.body, /<svg class="floor-plan"[^>]*viewBox="0 0 60 40"/);
        assert.match(page.body, /role="group"/, 'editors get a group of movable pieces');
        assert.equal(await room(), undefined, 'nothing is stored until someone saves');
    });

    it('places seating tables once, sized by their seats, with how many are seated', async () => {
        await owner.get('/seating');
        await owner.post('/seating/tables', { name: 'Table 1', seats: '8' });
        const tableId = (await app.pool.query(`SELECT id FROM seating_tables WHERE wedding_id = $1;`, [weddingId]))
            .rows[0].id;
        const page = await owner.get('/layout');
        assert.match(page.body, new RegExp(`<option value="${tableId}">Table 1`));

        assert.equal((await owner.post('/layout/tables', { table_id: tableId })).location, '/layout');
        assert.equal((await owner.post('/layout/tables', { table_id: tableId })).location, '/layout');
        const placed = await items();
        assert.equal(placed.length, 1, 'a table is placed only once');
        assert.deepEqual(
            { kind: placed[0].kind, shape: placed[0].shape, width: placed[0].width, x: placed[0].x, y: placed[0].y },
            { kind: 'table', shape: 'round', width: 5, x: 30, y: 20 }
        );
        const drawn = await owner.get('/layout');
        assert.match(drawn.body, /Table 1/);
        assert.match(drawn.body, /0\/8/);
        assert.doesNotMatch(drawn.body, new RegExp(`<option value="${tableId}">`), 'no longer offered');
    });

    it('fixtures get default sizes; a move is kept inside the room', async () => {
        await owner.get('/layout');
        assert.equal((await owner.post('/layout/items', { kind: 'dance_floor', label: '' })).location, '/layout');
        const [table, floor] = await items();
        assert.deepEqual([floor.width, floor.depth], [20, 20]);
        const apart =
            Math.abs(floor.x - table.x) >= (floor.width + table.width) / 2 ||
            Math.abs(floor.y - table.y) >= (floor.depth + table.depth) / 2;
        assert.ok(apart, 'placed beside the table, not on it');

        await owner.post(`/layout/items/${floor.id}/move`, { x: '1000', y: '-5' });
        const moved = (await items()).find((item) => item.id === floor.id);
        assert.deepEqual([moved.x, moved.y], [50, 10]);
    });

    it('moves answer JSON for drag and drop, snapped to half units', async () => {
        const floor = (await items()).find((item) => item.kind === 'dance_floor');
        const response = await jsonPost(owner, `/layout/items/${floor.id}/move`, { x: '25.26', y: '20.1' });
        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(response.body), { x: 25.5, y: 20 });
    });

    it('editing a piece: a turned piece is kept inside by its turned size', async () => {
        await owner.post('/layout/items', { kind: 'stage', label: 'Band' });
        const stage = (await items()).find((item) => item.kind === 'stage');
        assert.deepEqual([stage.width, stage.depth, stage.label], [16, 8, 'Band']);
        const saved = await owner.post(`/layout/items/${stage.id}`, {
            label: 'Band stage',
            shape: 'rect',
            x: '59',
            y: '20',
            width: '16',
            depth: '8',
            rotation: '90'
        });
        assert.equal(saved.location, '/layout');
        const turned = (await items()).find((item) => item.id === stage.id);
        assert.deepEqual([turned.label, turned.rotation, turned.x], ['Band stage', 90, 56]);
    });

    it('a smaller room pulls every piece back inside', async () => {
        assert.equal((await owner.post('/layout/room', { width: '30', depth: '20', unit: 'ft' })).location, '/layout');
        assert.deepEqual(await room(), { width: 30, depth: 20, unit: 'ft' });
        for (const item of await items()) {
            const turned = item.rotation % 180 === 90;
            const halfX = (turned ? item.depth : item.width) / 2;
            const halfY = (turned ? item.width : item.depth) / 2;
            assert.ok(item.x >= Math.min(halfX, 15) && item.x <= Math.max(30 - halfX, 15), `${item.kind} x ${item.x}`);
            assert.ok(item.y >= Math.min(halfY, 10) && item.y <= Math.max(20 - halfY, 10), `${item.kind} y ${item.y}`);
        }
        assert.match((await owner.get('/layout')).body, /viewBox="0 0 30 20"/);
    });

    it('changing the unit converts every piece, so the plan keeps its real size', async () => {
        const before = await items();
        assert.equal((await owner.post('/layout/room', { width: '9', depth: '6', unit: 'm' })).location, '/layout');
        const after = await items();
        const half = (value) => Math.round(value * 2) / 2;
        for (const [old, now] of before.map((item, i) => [item, after[i]])) {
            assert.equal(now.width, Math.max(0.5, half(old.width / 3.281)), `${old.kind} width`);
            assert.equal(now.depth, Math.max(0.5, half(old.depth / 3.281)), `${old.kind} depth`);
        }
        await owner.post('/layout/room', { width: '30', depth: '20', unit: 'ft' });
    });

    it('the editable plan is a labelled group so its pieces reach assistive technology', async () => {
        const page = await owner.get('/layout');
        assert.match(page.body, /<svg class="floor-plan"[^>]*role="group"[^>]*aria-labelledby="plan-title"/);
        assert.match((await viewer.get('/layout')).body, /<svg class="floor-plan"[^>]*role="img"/);
        const label = page.body.match(/aria-label="([^"]+)">Take off the plan</);
        assert.ok(
            label && label[1].startsWith('Take off the plan'),
            `visible text starts the accessible name: ${label?.[1]}`
        );
    });

    it('metric rooms get metric default sizes', async () => {
        await owner.post('/layout/room', { width: '20', depth: '15', unit: 'm' });
        await owner.post('/layout/items', { kind: 'bar', label: '' });
        const bar = (await items()).find((item) => item.kind === 'bar');
        assert.deepEqual([bar.width, bar.depth], [3.5, 1]);
    });

    it('bad input gives 400 and changes nothing', async () => {
        const before = await items();
        assert.equal((await owner.post('/layout/room', { width: '2', depth: '15', unit: 'm' })).status, 400);
        assert.equal((await owner.post('/layout/room', { width: '20', depth: '15', unit: 'yards' })).status, 400);
        assert.equal((await owner.post('/layout/items', { kind: 'pool', label: '' })).status, 400);
        const [first] = before;
        const bad = await owner.post(`/layout/items/${first.id}`, {
            label: '',
            shape: 'rect',
            x: '1',
            y: '1',
            width: '0',
            depth: '2',
            rotation: '400'
        });
        assert.equal(bad.status, 400);
        assert.equal((await jsonPost(owner, `/layout/items/${first.id}/move`, { x: 'left', y: '2' })).status, 400);
        assert.deepEqual(await items(), before);
        assert.deepEqual((await room()).unit, 'm');
    });

    it('viewers see the plan and a list of pieces, but no forms, and cannot change anything', async () => {
        const page = await viewer.get('/layout');
        assert.equal(page.status, 200);
        assert.match(page.body, /Band stage/);
        assert.doesNotMatch(page.body, /action="\/layout\/items"/);
        assert.doesNotMatch(page.body, /data-layout-editable/);
        const before = await items();
        await viewer.post('/layout/items', { kind: 'bar', label: '' });
        await viewer.post(`/layout/items/${before[0].id}/move`, { x: '3', y: '3' });
        await viewer.post(`/layout/items/${before[0].id}/delete`, {});
        await viewer.post('/layout/room', { width: '100', depth: '100', unit: 'ft' });
        assert.deepEqual(await items(), before);
        assert.equal((await room()).width, 20);
    });

    it("another wedding's pieces and tables give 404", async () => {
        const [first] = await items();
        const tableId = (await app.pool.query(`SELECT id FROM seating_tables WHERE wedding_id = $1;`, [weddingId]))
            .rows[0].id;
        await outsider.get('/layout');
        assert.equal((await outsider.post(`/layout/items/${first.id}/move`, { x: '3', y: '3' })).status, 404);
        assert.equal((await outsider.post(`/layout/items/${first.id}/delete`, {})).status, 404);
        assert.equal((await outsider.post('/layout/items/not-a-uuid/delete', {})).status, 404);
        assert.equal((await outsider.post('/layout/tables', { table_id: tableId })).status, 404);
        assert.equal((await items()).length, 4);
    });

    it('deleting a piece, and deleting a seating table takes it off the plan', async () => {
        const stage = (await items()).find((item) => item.kind === 'stage');
        assert.equal((await owner.post(`/layout/items/${stage.id}/delete`, {})).location, '/layout');
        const table = (await app.pool.query(`SELECT id FROM seating_tables WHERE wedding_id = $1;`, [weddingId]))
            .rows[0];
        await owner.get('/seating');
        await owner.post(`/seating/tables/${table.id}/delete`, {});
        assert.deepEqual(
            (await items()).map((item) => item.kind),
            ['dance_floor', 'bar']
        );
    });

    it('a plan holds at most 200 pieces', async () => {
        await app.pool.query(
            `INSERT INTO layout_items (wedding_id, kind, x, y, width, depth)
             SELECT $1, 'other', 5, 5, 1, 1 FROM generate_series(1, 198);`,
            [weddingId]
        );
        await owner.get('/layout');
        await owner.post('/layout/items', { kind: 'cake', label: '' });
        assert.equal((await items()).length, 200);
        assert.match((await owner.get('/layout')).body, /200 pieces/);
    });
});
