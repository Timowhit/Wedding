import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, realFetch, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const TRACK_ID = '4uLU6hMCjMI75M1A2tKUQC';
const PHOTO_ID = 'abc_123-XY';

/** Fakes the Spotify and Unsplash APIs; everything else goes to the real fetch. */
const fakeApis = (calls) => async (input, options) => {
    const url = new URL(String(input));
    calls.push(url);
    const json = (body, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.host === 'accounts.spotify.com') return json({ access_token: 'token', expires_in: 3600 });
    if (url.host === 'api.spotify.com') {
        const track = {
            id: TRACK_ID,
            name: 'Perfect',
            artists: [{ name: 'Ed Sheeran' }],
            album: {
                name: 'Divide',
                images: [{ url: 'https://i.scdn.co/image/big' }, { url: 'https://i.scdn.co/image/medium' }]
            }
        };
        if (url.pathname === '/v1/search') return json({ tracks: { items: [track, { ...track, id: 'bad id' }] } });
        if (url.pathname === `/v1/tracks/${TRACK_ID}`) return json(track);
        return json({ error: 'not found' }, 404);
    }
    if (url.host === 'api.unsplash.com') {
        const photo = {
            id: PHOTO_ID,
            alt_description: 'floral arch',
            urls: { small: 'https://images.unsplash.com/small', regular: 'https://images.unsplash.com/regular' },
            links: {
                html: 'https://unsplash.com/photos/abc',
                download_location: 'https://api.unsplash.com/photos/abc/download'
            },
            user: { name: 'Jo Photographer' }
        };
        if (url.pathname === '/search/photos') {
            return json({
                results: [photo, { ...photo, id: 'evil', urls: { small: 'https://evil.example/x.png', regular: 'x' } }]
            });
        }
        if (url.pathname === `/photos/${PHOTO_ID}`) return json(photo);
        if (url.pathname.endsWith('/download')) return json({});
        return json({ errors: ['nope'] }, 404);
    }
    return realFetch(input, options);
};

describe('music and inspiration search', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    const calls = [];
    before(async () => {
        app = await startTestApp({
            SPOTIFY_CLIENT_ID: 'id',
            SPOTIFY_CLIENT_SECRET: 'secret',
            UNSPLASH_ACCESS_KEY: 'key',
            GOOGLE_CLIENT_ID: 'google-id',
            GOOGLE_CLIENT_SECRET: 'google-secret'
        });
        globalThis.fetch = fakeApis(calls);
        owner = await registeredClient(app.baseUrl, 'Dee', 'dee@example.com');
    });
    beforeEach(() => {
        calls.length = 0;
    });
    after(async () => {
        globalThis.fetch = realFetch;
        await app?.close();
    });

    it('searches Spotify and saves track details looked up on the server', async () => {
        const page = await owner.get('/music?q=perfect');
        assert.match(page.body, /Perfect/);
        assert.match(page.body, /https:\/\/i.scdn.co\/image\/medium/);
        assert.doesNotMatch(page.body, /bad id/, 'results with invalid ids are dropped');

        const added = await owner.post('/music/tracks', {
            section: 'first-dance',
            track_id: TRACK_ID,
            track_name: 'Injected name',
            return_to: '/music?q=perfect'
        });
        assert.equal(added.location, '/music?q=perfect');
        const { rows } = await app.pool.query('SELECT section, track_name, artist_name FROM music_tracks;');
        assert.deepEqual(rows, [{ section: 'First Dance', track_name: 'Perfect', artist_name: 'Ed Sheeran' }]);

        await owner.post('/music/tracks', { section: 'first-dance', track_id: TRACK_ID });
        assert.match((await owner.get('/music')).body, /already in First dance/);
        assert.match((await owner.get('/music')).body, /open.spotify.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC/);

        await owner.post('/music/tracks', { section: 'nope', track_id: TRACK_ID });
        assert.match((await owner.get('/music')).body, /could not be found/);

        await owner.post('/music/sections/first-dance/clear');
        assert.match((await owner.get('/music')).body, /1 songs removed from First dance/);
    });

    it('searches Unsplash, keeps only safe image hosts and saves server-side details', async () => {
        const page = await owner.get('/inspiration?q=arch');
        assert.match(page.body, /images.unsplash.com\/small/);
        assert.match(page.body, /Photo by Jo Photographer/);
        assert.doesNotMatch(page.body, /evil.example/);

        await owner.post('/inspiration', { photo_id: PHOTO_ID, thumb_url: 'https://evil.example/x.png' });
        const { rows } = await app.pool.query('SELECT thumb_url FROM inspiration_photos;');
        assert.deepEqual(rows, [{ thumb_url: 'https://images.unsplash.com/small' }]);
        assert.ok(
            calls.some((url) => url.pathname.endsWith('/download')),
            'download is reported to Unsplash'
        );

        assert.match((await owner.get('/inspiration?q=arch')).body, /Saved/);
        await owner.post('/inspiration', { photo_id: PHOTO_ID });
        assert.match((await owner.get('/inspiration')).body, /already on your board/);

        await owner.post('/inspiration/clear');
        assert.match((await owner.get('/inspiration')).body, /1 photos removed/);
    });

    it('reports a service outage without failing the page', async () => {
        globalThis.fetch = async (input, options) =>
            String(input).includes('unsplash') ? new Response('down', { status: 503 }) : realFetch(input, options);
        try {
            const page = await owner.get('/inspiration?q=arch');
            assert.equal(page.status, 200);
            assert.match(page.body, /not responding right now/);
        } finally {
            globalThis.fetch = fakeApis(calls);
        }
    });

    it('starts Google sign-in with a state value stored in the session', async () => {
        const client = new TestClient(app.baseUrl);
        const response = await client.get('/auth/google');
        assert.equal(response.status, 302);
        const location = new URL(response.location);
        assert.equal(location.host, 'accounts.google.com');
        assert.ok(location.searchParams.get('state'));
        assert.equal(location.searchParams.get('redirect_uri'), 'http://planner.test/auth/google/callback');

        const forged = await client.get('/auth/google/callback?code=x&state=forged');
        assert.equal(forged.location, '/login');
    });
});
