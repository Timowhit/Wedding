import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

describe('vendor availability and proposals', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let outsider;
    let weddingId;
    let florist;
    let band;
    const q = (sql, params) => app.pool.query(sql, params);
    const proposalId = async (title) =>
        (await q(`SELECT id FROM vendor_proposals WHERE title = $1;`, [title])).rows[0]?.id;

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        weddingId = (
            await q(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'ana@example.com';`
            )
        ).rows[0].wedding_id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'viewer' FROM users WHERE email = 'vik@example.com';`,
            [weddingId]
        );
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        florist = (
            await q(`INSERT INTO vendors (wedding_id, name, category) VALUES ($1, 'Bloom', 'Florist') RETURNING id;`, [
                weddingId
            ])
        ).rows[0].id;
        band = (
            await q(
                `INSERT INTO vendors (wedding_id, name, category) VALUES ($1, 'The Tides', 'DJ / Band') RETURNING id;`,
                [weddingId]
            )
        ).rows[0].id;
        await owner.get(`/vendors/${florist}`);
    });
    after(() => app?.close());

    it('records whether a vendor is free on the day, or holding it until a date', async () => {
        const held = await owner.post(`/vendors/${florist}/availability`, {
            availability: 'hold',
            hold_until: '2027-01-15'
        });
        assert.equal(held.location, `/vendors/${florist}`);
        assert.match(
            textOf((await owner.get(`/vendors/${florist}`)).body),
            /Holding your date until Friday, January 15, 2027/
        );
        await owner.post(`/vendors/${band}/availability`, { availability: 'unavailable' });
        const list = textOf((await owner.get('/vendors')).body);
        assert.match(list, /Not available/);
        assert.match(list, /Holding your date/);
    });

    it('a hold needs its end date; unknown choices are refused', async () => {
        assert.equal((await owner.post(`/vendors/${florist}/availability`, { availability: 'hold' })).status, 400);
        assert.equal((await owner.post(`/vendors/${florist}/availability`, { availability: 'maybe' })).status, 400);
    });

    it('adds a proposal with an amount, an expiry and a file of this vendor', async () => {
        const file = (
            await q(
                `INSERT INTO wedding_files (wedding_id, vendor_id, kind, name, content_type, size, data)
                 VALUES ($1, $2, 'other', 'quote.pdf', 'application/pdf', 4, '\\x25504446') RETURNING id;`,
                [weddingId, florist]
            )
        ).rows[0].id;
        const added = await owner.post(`/vendors/${florist}/proposals`, {
            title: 'Full package',
            amount: '2,400',
            valid_until: '2027-02-01',
            file_id: file,
            notes: 'Arch, bouquets and centrepieces'
        });
        assert.equal(added.location, `/vendors/${florist}`);
        const page = await owner.get(`/vendors/${florist}`);
        const text = textOf(page.body);
        assert.match(text, /Full package/);
        assert.match(text, /\$2,400\.00/);
        assert.match(text, /Valid until Monday, February 1, 2027/);
        assert.match(page.body, new RegExp(`href="/files/${file}"`));
    });

    it('refuses a file from another vendor, and needs a title', async () => {
        const otherFile = (
            await q(
                `INSERT INTO wedding_files (wedding_id, vendor_id, kind, name, content_type, size, data)
                 VALUES ($1, $2, 'other', 'band.pdf', 'application/pdf', 4, '\\x25504446') RETURNING id;`,
                [weddingId, band]
            )
        ).rows[0].id;
        const wrongFile = await owner.post(`/vendors/${florist}/proposals`, { title: 'Sneaky', file_id: otherFile });
        assert.equal(wrongFile.status, 400);
        const noTitle = await owner.post(`/vendors/${florist}/proposals`, { title: '', amount: '300' });
        assert.equal(noTitle.status, 400);
        assert.match(noTitle.body, /value="300"/);
        assert.equal(await proposalId('Sneaky'), undefined);
    });

    it('accepts or declines a proposal; proposal amounts never count as money spent', async () => {
        const before = (await owner.get('/budget')).body;
        const id = await proposalId('Full package');
        await owner.post(`/proposals/${id}/status`, { status: 'accepted' });
        assert.equal((await q(`SELECT status FROM vendor_proposals WHERE id = $1;`, [id])).rows[0].status, 'accepted');
        assert.match(textOf((await owner.get(`/vendors/${florist}`)).body), /Accepted/);
        assert.equal(textOf((await owner.get('/budget')).body).includes('2,400'), textOf(before).includes('2,400'));
        assert.equal((await owner.post(`/proposals/${id}/status`, { status: 'eaten' })).status, 400);
    });

    it('viewers only read; another wedding gets 404', async () => {
        const id = await proposalId('Full package');
        const asViewer = await viewer.get(`/vendors/${florist}`);
        assert.match(textOf(asViewer.body), /Full package/);
        assert.doesNotMatch(asViewer.body, /action="\/vendors\/[^"]+\/proposals"/);
        await viewer.post(`/proposals/${id}/delete`, {});
        assert.ok(await proposalId('Full package'));

        await outsider.get('/');
        assert.equal((await outsider.post(`/proposals/${id}/status`, { status: 'declined' })).status, 404);
        assert.equal((await outsider.post(`/proposals/${id}/delete`, {})).status, 404);
        assert.equal(
            (await outsider.post(`/vendors/${florist}/availability`, { availability: 'available' })).status,
            404
        );

        await owner.post(`/proposals/${id}/delete`, {});
        assert.equal(await proposalId('Full package'), undefined);
    });
});
