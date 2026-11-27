import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp, TestClient } from '../helpers/app.js';

const themeOf = (body) => body.match(/<html lang="\w+" data-palette="(\w+)" data-mode="(\w+)"/)?.slice(1);

describe('appearance', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    describe('header: logo and wedding selector', () => {
        it('shows the ring logo and an SVG favicon', async () => {
            const couple = await registeredClient(app.baseUrl, 'Lia', 'lia@example.com');
            const page = await couple.get('/');
            assert.match(page.body, /<svg class="brand__mark"[^>]*aria-hidden="true"/);
            assert.match(page.body, /<link rel="icon" href="\/images\/logo.svg" type="image\/svg\+xml">/);
            const svg = await couple.get('/images/logo.svg');
            assert.equal(svg.status, 200);
        });

        it('one wedding shows its name as text; several get a selector with dates', async () => {
            const couple = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
            const one = await couple.get('/');
            assert.doesNotMatch(one.body, /id="wedding-switcher"/);
            assert.match(one.body, /class="wedding-current"/);
            await couple.post('/wedding/date', { wedding_date: '2027-09-18' });
            assert.match((await couple.get('/')).body, /class="wedding-current"[^]*?Ana.s Wedding · [^<]*2027/);

            await couple.post('/weddings', { name: 'Second wedding', wedding_date: '2027-06-12' });
            const two = await couple.get('/');
            assert.match(two.body, /id="wedding-switcher"/);
            assert.doesNotMatch(two.body, /class="wedding-current"/);
            assert.match(two.body, /<option value="[0-9a-f-]+" selected>Second wedding · [^<]*2027<\/option>/);
        });
    });

    describe('custom colours and live appearance settings', () => {
        it('serves the stylesheet for a colours key, cached for ever, and 404s bad keys', async () => {
            const visitor = new TestClient(app.baseUrl);
            const css = await visitor.get('/css/custom/a85a73-4f7a59-b8862b-p.css');
            assert.equal(css.status, 200);
            assert.match(css.headers.get('content-type'), /text\/css/);
            assert.match(css.headers.get('cache-control'), /immutable/);
            assert.match(css.body, /data-palette='custom'/);
            for (const bad of ['nope', 'A85A73-4f7a59-b8862b-p', 'a85a73-4f7a59-b8862b-z']) {
                assert.equal((await visitor.get(`/css/custom/${bad}.css`)).status, 404, bad);
            }
        });

        it('saves custom colours from the form and links their stylesheet', async () => {
            const couple = await registeredClient(app.baseUrl, 'Mae', 'mae@example.com');
            await couple.get('/settings');
            const saved = await couple.post('/settings/appearance', {
                palette: 'custom',
                mode: 'light',
                primary: '#123456',
                secondary: '#654321',
                accent: '#ABCDEF',
                background: 's'
            });
            assert.equal(saved.location, '/settings');
            const page = await couple.get('/settings');
            assert.deepEqual(themeOf(page.body), ['custom', 'light']);
            assert.match(
                page.body,
                /<link rel="stylesheet" href="\/css\/custom\/123456-654321-abcdef-s.css" data-custom-theme>/
            );
            assert.match(page.body, /name="primary" value="#123456"/, 'the form shows the saved colours');

            await couple.post('/settings/appearance', {
                palette: 'sage',
                mode: 'light',
                primary: '#123456',
                secondary: '#654321',
                accent: '#abcdef',
                background: 's'
            });
            const sage = await couple.get('/settings');
            assert.deepEqual(themeOf(sage.body), ['sage', 'light']);
            assert.doesNotMatch(sage.body, /data-custom-theme>/);
            assert.match(sage.body, /name="primary" value="#123456"/, 'custom colours are kept for later');

            const bad = await couple.post('/settings/appearance', {
                palette: 'custom',
                mode: 'light',
                primary: 'red',
                secondary: '#654321',
                accent: '#abcdef',
                background: 's'
            });
            assert.equal(bad.status, 400);
        });

        it('answers JSON when the page saves itself as you change it', async () => {
            const couple = await registeredClient(app.baseUrl, 'Ola', 'ola@example.com');
            await couple.get('/settings');
            const body = new URLSearchParams({
                _csrf: couple.csrfToken,
                palette: 'custom',
                mode: 'dark',
                primary: '#a85a73',
                secondary: '#4f7a59',
                accent: '#b8862b',
                background: 'n'
            });
            const json = await couple.request('/settings/appearance', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
                body
            });
            assert.equal(json.status, 200);
            assert.deepEqual(JSON.parse(json.body), {
                palette: 'custom',
                mode: 'dark',
                colors: 'a85a73-4f7a59-b8862b-n',
                applied: true
            });
            assert.deepEqual(themeOf((await couple.get('/settings')).body), ['custom', 'dark']);

            body.set('mode', 'sepia');
            const invalid = await couple.request('/settings/appearance', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
                body
            });
            assert.equal(invalid.status, 400);
            assert.ok(JSON.parse(invalid.body).errors.length > 0);
        });
    });
});
