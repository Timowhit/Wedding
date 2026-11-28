import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { realFetch, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const id = (n) => `Track${String(n).padStart(17, '0')}`; // 22 base-62 characters, like a Spotify id
const TITLES = { [id(1)]: 'First Light', [id(2)]: 'Second Wind', [id(3)]: 'Third Time' };

/** Spotify's oEmbed endpoint: a title and a cover for a public track URL, no keys needed. */
const fakeOembed = (calls) => async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.host !== 'open.spotify.com' || url.pathname !== '/oembed') return realFetch(input, options);
    calls.push(url);
    const trackId = /\/track\/([A-Za-z0-9]{22})$/.exec(url.searchParams.get('url') ?? '')?.[1];
    if (!TITLES[trackId]) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(
        JSON.stringify({
            title: TITLES[trackId],
            thumbnail_url:
                trackId === id(3) ? 'https://evil.example/x.png' : 'https://image-cdn-ak.spotifycdn.com/image/abc'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    );
};

describe('DJ page: songs from Spotify links, in order, played in the page', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let weddingId;
    const calls = [];
    const q = (sql, params) => app.pool.query(sql, params);
    const order = async (section) =>
        (
            await q(
                `SELECT track_id FROM music_tracks WHERE wedding_id = $1 AND section = $2 ORDER BY sort_order, created_at, id;`,
                [weddingId, section]
            )
        ).rows.map((row) => row.track_id);
    const rowId = async (trackId) =>
        (await q(`SELECT id FROM music_tracks WHERE track_id = $1;`, [trackId])).rows[0].id;

    before(async () => {
        app = await startTestApp(); // no Spotify keys: search is off, links still work
        globalThis.fetch = fakeOembed(calls);
        owner = await registeredClient(app.baseUrl, 'Dee', 'dee@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vic', 'vic@example.com');
        weddingId = (
            await q(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'dee@example.com';`
            )
        ).rows[0].wedding_id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'viewer' FROM users WHERE email = 'vic@example.com';`,
            [weddingId]
        );
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
    });
    after(async () => {
        globalThis.fetch = realFetch;
        await app?.close();
    });

    it('is in the menu without Spotify keys, with a form to add a song by its link', async () => {
        const page = (await owner.get('/music')).body;
        assert.match(page, /href="\/music"/);
        assert.match(page, /action="\/music\/links"/);
    });

    it('adds a song from a Spotify link; its title and cover come from Spotify, not the form', async () => {
        const added = await owner.post('/music/links', {
            link: `https://open.spotify.com/intl-es/track/${id(1)}?si=abc123`,
            section: 'reception',
            track_name: 'Injected'
        });
        assert.equal(added.status, 302);
        const row = (await q(`SELECT section, track_name, artwork_url FROM music_tracks WHERE track_id = $1;`, [id(1)]))
            .rows[0];
        assert.deepEqual(row, {
            section: 'Reception',
            track_name: 'First Light',
            artwork_url: 'https://image-cdn-ak.spotifycdn.com/image/abc'
        });
        assert.ok(calls.length > 0, 'looked up on the server');

        await owner.post('/music/links', { link: `spotify:track:${id(2)}`, section: 'reception' });
        await owner.post('/music/links', { link: id(3), section: 'reception' });
        const third = (await q(`SELECT artwork_url FROM music_tracks WHERE track_id = $1;`, [id(3)])).rows[0];
        assert.equal(third.artwork_url, null, 'a cover from another host is dropped');
        assert.deepEqual(await order('Reception'), [id(1), id(2), id(3)], 'new songs go to the end');
    });

    it('refuses links that are not Spotify tracks, and tracks Spotify does not know', async () => {
        const bad = await owner.post('/music/links', { link: 'https://evil.example/track/x', section: 'reception' });
        assert.equal(bad.status, 400);
        assert.match(bad.body, /aria-invalid="true"/);
        const unknown = await owner.post('/music/links', {
            link: `https://open.spotify.com/track/${'Z'.repeat(22)}`,
            section: 'reception'
        });
        assert.equal(unknown.status, 400, 'shown on the form, with the link kept');
        assert.match(unknown.body, /Spotify doesn’t know that song/);
        assert.match(unknown.body, /value="https:\/\/open\.spotify\.com\/track\/Z{22}"/);
        assert.equal((await owner.post('/music/links', { link: id(1), section: 'nope' })).status, 400);
    });

    it('moves a song up or down within its section', async () => {
        await owner.post(`/music/tracks/${await rowId(id(3))}/move`, { direction: 'up' });
        assert.deepEqual(await order('Reception'), [id(1), id(3), id(2)]);
        await owner.post(`/music/tracks/${await rowId(id(1))}/move`, { direction: 'up' });
        assert.deepEqual(await order('Reception'), [id(1), id(3), id(2)], 'the first stays first');
        await owner.post(`/music/tracks/${await rowId(id(1))}/move`, { direction: 'down' });
        assert.deepEqual(await order('Reception'), [id(3), id(1), id(2)]);
        await viewer.get('/music');
        await viewer.post(`/music/tracks/${await rowId(id(2))}/move`, { direction: 'up' });
        assert.deepEqual(await order('Reception'), [id(3), id(1), id(2)], 'viewers cannot reorder');
    });

    it('each section has a player that plays its songs in order, allowed by the page policy', async () => {
        const response = await owner.get('/music');
        assert.match(response.body, new RegExp(`data-dj-player[^>]*data-tracks="${id(3)},${id(1)},${id(2)}"`));
        const policy = response.headers.get('content-security-policy');
        assert.match(policy, /script-src[^;]*https:\/\/open\.spotify\.com\/embed\//, 'only Spotify’s embed scripts');
        assert.doesNotMatch(policy, /script-src[^;]*https:\/\/open\.spotify\.com[ ;]/, 'not the whole host');
        assert.match(
            response.headers.get('content-security-policy'),
            /img-src[^;]*https:\/\/image-cdn-ak\.spotifycdn\.com/
        );
    });
});
