import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://planner.example';
const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

/** Loads public/sw.js with a stub `self` and returns the functions it exposes. */
const loadWorker = () => {
    const self = { addEventListener() {}, location: { origin: ORIGIN } };
    vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), { self, URL });
    return self;
};

describe('service worker', () => {
    const { routeFor, shouldStore, weddingAction, markSavedCopy } = loadWorker();
    const route = (path, origin = ORIGIN) => routeFor(new URL(path, origin), ORIGIN);

    it('routeFor classifies paths', () => {
        for (const path of [
            '/css/main.css',
            '/css/themes.css',
            '/css/custom/a85a73-4f7a59-b8862b-n.css',
            '/js/app.js',
            '/js/palette.js',
            '/images/logo.svg'
        ]) {
            assert.equal(route(path), 'static', path);
        }
        for (const path of ['/schedule', '/schedule?print=1', '/layout', '/vendors', `/vendors/${ID}`, '/offline']) {
            assert.equal(route(path), 'event', path);
        }
        for (const path of [
            `/vendors/${ID}/edit`,
            `/vendors/${ID}/contract`,
            '/budget',
            '/',
            '/vendors/not-an-id',
            '/colors',
            '/layout/items'
        ]) {
            assert.equal(route(path), 'page', path);
        }
        assert.equal(route('/schedule', 'https://evil.example'), 'skip');
        assert.equal(route('/sw.js'), 'skip');
    });

    it('shouldStore only keeps good same-origin responses', () => {
        const good = { ok: true, status: 200, redirected: false, url: `${ORIGIN}/schedule`, type: 'basic' };
        assert.equal(shouldStore(good), true);
        assert.equal(shouldStore({ ...good, ok: false, status: 404 }), false);
        assert.equal(shouldStore({ ...good, ok: false, status: 500 }), false);
        assert.equal(shouldStore({ ...good, status: 302, ok: false }), false);
        assert.equal(shouldStore({ ...good, redirected: true, url: `${ORIGIN}/login` }), false);
        assert.equal(shouldStore({ ...good, url: `${ORIGIN}/login` }), false);
        assert.equal(shouldStore({ ...good, type: 'opaque' }), false);
    });

    it('weddingAction clears saved pages when the wedding changes or nobody is signed in', () => {
        const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        assert.equal(weddingAction(null, A), 'remember');
        assert.equal(weddingAction(A, A), 'keep');
        assert.equal(weddingAction(A, B), 'clear');
        assert.equal(weddingAction(A, 'none'), 'clear');
        assert.equal(weddingAction(null, 'none'), 'remember');
        assert.equal(weddingAction(A, null), 'keep', 'responses without the header change nothing');
    });

    it('markSavedCopy flags a page served from the saved copy', () => {
        const html =
            '<html><body class="x" data-offline data-rendered-at="2027-01-01T10:00:00.000Z"><p>data-rendered-at</p>';
        assert.equal(
            markSavedCopy(html),
            '<html><body class="x" data-offline data-saved-copy data-rendered-at="2027-01-01T10:00:00.000Z"><p>data-rendered-at</p>'
        );
        assert.equal(markSavedCopy('<p>no marker</p>'), '<p>no marker</p>');
    });
});
