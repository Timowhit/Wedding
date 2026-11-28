import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('public landing page', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    it('logged-out visitors get the planner landing page with the founding offer', async () => {
        await app.pool.query('UPDATE founding_counter SET next_number = 13;');
        const page = await new TestClient(app.baseUrl).get('/');
        assert.equal(page.status, 200);
        assert.match(page.body, /Start now/);
        assert.match(page.body, /40%/);
        assert.match(page.body, /first 300 planners/);
        assert.match(page.body, /288 spots left/);
        assert.match(page.body, /href="\/register\?as=planner"/);
        assert.match(page.body, /href="\/register\?as=couple"/);
        assert.doesNotMatch(page.body, /Coming next/, 'nothing is listed as coming next right now');
        assert.doesNotMatch(page.body, /Sign up/i);
        assert.doesNotMatch(page.body, /<script[^>]+src="https?:/, 'no third-party scripts');
    });

    it('shows real screenshots that exist', async () => {
        const page = await new TestClient(app.baseUrl).get('/');
        const images = [...page.body.matchAll(/<img[^>]+src="(\/images\/[^"]+)"/g)].map((m) => m[1]);
        assert.ok(images.length >= 4, 'at least four screenshots');
        for (const src of images) {
            await access(new URL(`../../public${src}`, import.meta.url));
            assert.equal((await new TestClient(app.baseUrl).get(src)).status, 200, src);
        }
        assert.ok(
            [...page.body.matchAll(/<img (?![^>]*alt="")[^>]*alt="[^"]+"/g)].length >= 4,
            'screenshots have alt text'
        );
    });

    it('says the founding offer has ended once the 300 spots are gone', async () => {
        await app.pool.query('UPDATE founding_counter SET next_number = 301;');
        const page = await new TestClient(app.baseUrl).get('/');
        assert.match(page.body, /The founding offer has ended/);
        assert.doesNotMatch(page.body, /spots left/);
    });

    it('logged-in members still get their dashboard at /', async () => {
        const couple = await registeredClient(app.baseUrl, 'Lia', 'lia@example.com');
        const page = await couple.get('/');
        assert.equal(page.status, 200);
        assert.match(page.body, /<em>Our<\/em> wedding dashboard/);
    });

    it('is translated', async () => {
        const page = await new TestClient(app.baseUrl).request('/', { headers: { 'accept-language': 'es' } });
        assert.match(page.body, /<html lang="es"/);
        assert.match(page.body, /Empieza ahora/);
    });

    it('speaks French and Brazilian Portuguese too, with each language in the picker', async () => {
        const french = await new TestClient(app.baseUrl).request('/', { headers: { 'accept-language': 'fr-FR' } });
        assert.match(french.body, /<html lang="fr"/);
        assert.match(french.body, /Tous les <em>mariages<\/em> de vos clients/);
        const portuguese = await new TestClient(app.baseUrl).request('/', { headers: { 'accept-language': 'pt-BR' } });
        assert.match(portuguese.body, /<html lang="pt"/);
        assert.match(portuguese.body, /Começar agora/);
        assert.match(portuguese.body, /<option value="fr"[^>]*>Français<\/option>/);
        assert.match(portuguese.body, /<option value="pt"[^>]*>Português \(Brasil\)<\/option>/);
    });
});
