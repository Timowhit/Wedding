import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const themeOf = (body) => body.match(/<html lang="\w+" data-palette="(\w+)" data-mode="(\w+)"/)?.slice(1);

describe('wedding colours', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let weddingId;
    const colors = async () =>
        (
            await app.pool.query(
                `SELECT id, hex, name FROM wedding_colors WHERE wedding_id = $1 ORDER BY sort_order;`,
                [weddingId]
            )
        ).rows;

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Rosa', 'rosa@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vic', 'vic@example.com');
        const ids = await app.pool.query(
            `SELECT u.email, wm.wedding_id, u.id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
        );
        const byEmail = Object.fromEntries(ids.rows.map((row) => [row.email, row]));
        weddingId = byEmail['rosa@example.com'].wedding_id;
        await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'viewer');`, [
            weddingId,
            byEmail['vic@example.com'].id
        ]);
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
    });
    after(() => app?.close());

    it('an editor adds colours by picker or hex code, with an optional name', async () => {
        await owner.get('/colors');
        assert.equal(
            (await owner.post('/colors', { picker: '#C48B9F', hex: '', name: 'Dusty rose' })).location,
            '/colors'
        );
        assert.equal((await owner.post('/colors', { picker: '#000000', hex: '7a9e7e', name: '' })).location, '/colors');
        assert.deepEqual(
            (await colors()).map(({ hex, name }) => [hex, name]),
            [
                ['#c48b9f', 'Dusty rose'],
                ['#7a9e7e', null]
            ],
            'a typed hex code wins over the picker'
        );
        const page = await owner.get('/colors');
        assert.match(page.body, /Dusty rose/);
        assert.match(page.body, /fill="#c48b9f"/, 'swatches are drawn with SVG, not inline styles');

        const bad = await owner.post('/colors', { picker: '#000000', hex: 'not a colour', name: '' });
        assert.equal(bad.status, 400);
        assert.match(bad.body, /value="not a colour"/);
        assert.equal((await colors()).length, 2);
    });

    it('the photo tools are there for JavaScript, and say the photo stays on the device', async () => {
        const page = await owner.get('/colors');
        assert.match(page.body, /<script src="\/js\/palette.js\?v=[0-9a-f]{10}" defer><\/script>/);
        assert.match(page.body, /type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
        assert.match(page.body, /data-palette-photo/);
    });

    it('turns the app colours on and off for everyone in the wedding', async () => {
        const [rose, sage] = await colors();
        await owner.get('/colors');
        const on = await owner.post('/colors/app', {
            primary: rose.hex,
            secondary: sage.hex,
            accent: '#b8862b',
            background: 'p'
        });
        assert.equal(on.location, '/colors');
        assert.deepEqual(themeOf((await owner.get('/')).body), ['custom', 'auto']);
        const seen = await viewer.get('/');
        assert.deepEqual(themeOf(seen.body), ['custom', 'auto'], 'every member sees them');
        assert.match(seen.body, /\/css\/custom\/c48b9f-7a9e7e-b8862b-p.css/);

        await owner.post('/colors/app/off', {});
        assert.deepEqual(themeOf((await viewer.get('/')).body), ['rose', 'auto']);

        assert.equal(
            (
                await owner.post('/colors/app', {
                    primary: 'red',
                    secondary: sage.hex,
                    accent: '#b8862b',
                    background: 'p'
                })
            ).status,
            400
        );
    });

    it('viewers see the colours but cannot change them', async () => {
        const page = await viewer.get('/colors');
        assert.equal(page.status, 200);
        assert.match(page.body, /Dusty rose/);
        assert.doesNotMatch(page.body, /action="\/colors"/);
        const before = await colors();
        await viewer.post('/colors', { picker: '#111111', hex: '', name: 'Nope' });
        await viewer.post(`/colors/${before[0].id}/delete`, {});
        await viewer.post('/colors/app', {
            primary: '#111111',
            secondary: '#222222',
            accent: '#333333',
            background: 'n'
        });
        assert.deepEqual(await colors(), before);
        const wedding = await app.pool.query(`SELECT theme_colors FROM weddings WHERE id = $1;`, [weddingId]);
        assert.equal(wedding.rows[0].theme_colors, null);
    });

    it("deleting checks the wedding: another wedding's colour gives 404", async () => {
        const outsider = await registeredClient(app.baseUrl, 'Oz', 'oz@example.com');
        const [first] = await colors();
        await outsider.get('/colors');
        assert.equal((await outsider.post(`/colors/${first.id}/delete`, {})).status, 404);
        assert.equal((await outsider.post('/colors/not-a-uuid/delete', {})).status, 404);
        await owner.get('/colors');
        assert.equal((await owner.post(`/colors/${first.id}/delete`, {})).location, '/colors');
        assert.equal((await colors()).length, 1);
    });

    it('a wedding keeps at most 12 colours', async () => {
        await app.pool.query(
            `INSERT INTO wedding_colors (wedding_id, hex, sort_order) SELECT $1, '#123456', n FROM generate_series(10, 20) AS n;`,
            [weddingId]
        );
        assert.equal((await colors()).length, 12);
        await owner.get('/colors');
        await owner.post('/colors', { picker: '#abcdef', hex: '', name: 'Thirteenth' });
        assert.equal((await colors()).length, 12);
        assert.match((await owner.get('/colors')).body, /12 colours/);
    });
});
