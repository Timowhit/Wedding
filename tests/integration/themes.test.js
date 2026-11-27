import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const themeOf = (body) => body.match(/<html lang="\w+" data-palette="(\w+)" data-mode="(\w+)">/)?.slice(1);

describe('colour themes', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    it('pages use the default theme and load the theme stylesheet', async () => {
        const couple = await registeredClient(app.baseUrl, 'Cleo', 'cleo@example.com');
        const page = await couple.get('/');
        assert.deepEqual(themeOf(page.body), ['rose', 'auto']);
        assert.match(page.body, /<link rel="stylesheet" href="\/css\/themes.css\?v=[0-9a-f]{10}">/);
        assert.match(page.body, /<link rel="stylesheet" href="\/css\/main.css\?v=[0-9a-f]{10}">/);
        assert.match(page.body, /<script src="\/js\/app.js\?v=[0-9a-f]{10}" defer>/);
    });

    it('a user saves a palette and mode in Settings', async () => {
        const couple = await registeredClient(app.baseUrl, 'Ines', 'ines@example.com');
        await couple.get('/settings');
        const saved = await couple.post('/settings/appearance', { palette: 'sage', mode: 'dark' });
        assert.equal(saved.location, '/settings');
        assert.deepEqual(themeOf((await couple.get('/settings')).body), ['sage', 'dark']);

        const invalid = await couple.post('/settings/appearance', { palette: 'neon', mode: 'dark' });
        assert.equal(invalid.status, 400);
    });

    it("the planner's brand palette applies inside the planner's wedding only", async () => {
        const planner = await registeredClient(app.baseUrl, 'Pia', 'pia@example.com');
        const client = await registeredClient(app.baseUrl, 'Cal', 'cal@example.com');
        const ids = await app.pool.query(
            `SELECT id, email FROM users WHERE email IN ('pia@example.com', 'cal@example.com');`
        );
        const id = Object.fromEntries(ids.rows.map((row) => [row.email, row.id]));
        await app.pool.query(`UPDATE users SET account_type = 'planner', brand_palette = 'navy' WHERE id = $1;`, [
            id['pia@example.com']
        ]);
        const wedding = await app.pool.query(
            `UPDATE weddings SET planner_managed = true
             WHERE id = (SELECT wedding_id FROM wedding_members WHERE user_id = $1 AND role = 'owner')
             RETURNING id;`,
            [id['pia@example.com']]
        );
        await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'client');`, [
            wedding.rows[0].id,
            id['cal@example.com']
        ]);

        await client.get('/');
        await client.post('/wedding/switch', { wedding_id: wedding.rows[0].id, return_to: '/' });
        assert.deepEqual(themeOf((await client.get('/')).body), ['navy', 'auto'], 'clients see the brand');

        await planner.get('/settings');
        await planner.post('/settings/business', { business_name: 'Pia Events', brand_palette: 'champagne' });
        assert.deepEqual(themeOf((await client.get('/')).body), ['champagne', 'auto']);

        const own = await app.pool.query(
            `SELECT wedding_id FROM wedding_members WHERE user_id = $1 AND role = 'owner';`,
            [id['cal@example.com']]
        );
        await client.post('/wedding/switch', { wedding_id: own.rows[0].wedding_id, return_to: '/' });
        assert.deepEqual(themeOf((await client.get('/')).body), ['rose', 'auto'], 'their own wedding is unbranded');
    });

    it('only planners can save business details', async () => {
        const couple = await registeredClient(app.baseUrl, 'Noa', 'noa@example.com');
        await couple.get('/settings');
        assert.equal(
            (await couple.post('/settings/business', { business_name: 'X', brand_palette: 'navy' })).status,
            404
        );
    });
});
