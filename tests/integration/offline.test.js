import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, realFetch, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('offline event day', { skip: skipWithoutDb }, () => {
    let app;
    let couple;

    before(async () => {
        app = await startTestApp();
        couple = await registeredClient(app.baseUrl, 'Ivy', 'ivy@example.com');
    });
    after(() => app?.close());

    it('sw.js is served as JavaScript', async () => {
        const response = await realFetch(`${app.baseUrl}/sw.js`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /javascript/);
    });

    it('offline page works for visitors and members', async () => {
        for (const client of [new TestClient(app.baseUrl), couple]) {
            const page = await client.get('/offline');
            assert.equal(page.status, 200);
            assert.match(page.body, /offline/i);
            assert.match(page.body, /href="\/schedule"/);
            assert.match(page.body, /href="\/vendors"/);
        }
    });

    it('signed-in pages are marked for offline; visitor pages are not', async () => {
        const member = (await couple.get('/schedule')).body;
        assert.match(member, /<body[^>]* data-offline/);
        assert.match(member, /<body[^>]* data-rendered-at="\d{4}-\d{2}-\d{2}T[^"]+"/);
        assert.match(member, /data-offline-banner[^>]*hidden/);
        const visitor = (await new TestClient(app.baseUrl).get('/login')).body;
        assert.doesNotMatch(visitor, /<body[^>]* data-offline[ >]/);
    });

    it('schedule links vendors and offers Save for offline', async () => {
        await couple.get('/vendors');
        await couple.post('/vendors', { name: 'DJ Nova', category: 'DJ / Band', status: 'Booked' });
        const vendorId = (await app.pool.query(`SELECT id FROM vendors WHERE name = 'DJ Nova';`)).rows[0].id;
        await couple.get('/schedule');
        await couple.post('/schedule', { starts_at: '18:00', title: 'First dance', vendor_id: vendorId });
        const page = (await couple.get('/schedule')).body;
        assert.match(page, new RegExp(`<a href="/vendors/${vendorId}" data-offline-page>DJ Nova</a>`));
        assert.match(page, /<button type="button"[^>]*data-save-offline[^>]*hidden/);
    });

    it('every page tells the service worker which wedding it belongs to', async () => {
        const weddingId = (
            await app.pool.query(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'ivy@example.com';`
            )
        ).rows[0].wedding_id;
        assert.equal((await couple.get('/schedule')).headers.get('x-fp-wedding'), weddingId);
        assert.equal((await couple.get('/vendors')).headers.get('x-fp-wedding'), weddingId);
        assert.equal((await new TestClient(app.baseUrl).get('/login')).headers.get('x-fp-wedding'), 'none');
    });

    it('the print view carries the offline banner too', async () => {
        assert.match((await couple.get('/schedule?print=1')).body, /data-offline-banner/);
    });

    it('the offline page has no "copy saved at" banner', async () => {
        assert.doesNotMatch((await couple.get('/offline')).body, /data-offline-banner/);
    });

    it('sign-out clears site data', async () => {
        const temp = await registeredClient(app.baseUrl, 'Tem', 'tem@example.com');
        await temp.get('/');
        const response = await temp.post('/logout');
        const header = response.headers.get('clear-site-data') ?? '';
        assert.match(header, /"cache"/);
        assert.match(header, /"storage"/);
    });

    it('pages name the active wedding, so app.js can clear an offline copy that belongs to another', async () => {
        const planner = new TestClient(app.baseUrl);
        await planner.get('/register?as=planner');
        await planner.post('/register', {
            as: 'planner',
            name: 'Paz',
            email: 'paz@example.com',
            password: 'correct horse battery',
            confirm_password: 'correct horse battery'
        });
        await planner.get('/planner');
        await planner.post('/planner/weddings', { name: 'One', wedding_date: '' });
        await planner.post('/planner/weddings', { name: 'Two', wedding_date: '' });
        const ids = (await app.pool.query(`SELECT id, name FROM weddings WHERE name IN ('One', 'Two') ORDER BY name;`))
            .rows;
        await planner.post(`/planner/weddings/${ids[0].id}/open`);
        assert.match((await planner.get('/schedule')).body, new RegExp(`<body[^>]* data-wedding="${ids[0].id}"`));
        await planner.post('/wedding/switch', { wedding_id: ids[1].id, return_to: '/' });
        assert.match((await planner.get('/schedule')).body, new RegExp(`<body[^>]* data-wedding="${ids[1].id}"`));
    });
});
