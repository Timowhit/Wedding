import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('header: logo and wedding selector', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

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

        await couple.post('/weddings', { name: 'Second wedding', wedding_date: '2027-06-12' });
        const two = await couple.get('/');
        assert.match(two.body, /id="wedding-switcher"/);
        assert.doesNotMatch(two.body, /class="wedding-current"/);
        assert.match(two.body, /<option value="[0-9a-f-]+" selected>Second wedding · [^<]*2027<\/option>/);
    });
});
