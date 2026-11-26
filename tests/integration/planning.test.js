import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const idOf = (body, pattern) => body.match(pattern)?.[1];

describe('planning pages', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let stranger;
    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Owner', 'owner@example.com');
        stranger = await registeredClient(app.baseUrl, 'Stranger', 'stranger@example.com');
    });
    after(() => app?.close());

    it('every planning page renders for a member', async () => {
        for (const path of [
            '/',
            '/budget',
            '/guests',
            '/vendors',
            '/checklist',
            '/music',
            '/inspiration',
            '/settings'
        ]) {
            const response = await owner.get(path);
            assert.equal(response.status, 200, path);
            assert.match(response.body, /<main id="main-content"/, path);
            assert.doesNotMatch(response.body, /style="/, `${path} must not use inline styles (CSP)`);
            assert.doesNotMatch(response.body, /\son[a-z]+="/, `${path} must not use inline event handlers (CSP)`);
        }
    });

    it('budget: sets a limit, adds and deletes expenses, validates input', async () => {
        await owner.get('/budget');
        assert.equal((await owner.post('/budget/limit', { total: '10,000' })).location, '/budget');
        const added = await owner.post('/budget/expenses', {
            name: 'Venue deposit',
            category: 'Venue',
            amount: '2500.50'
        });
        assert.equal(added.status, 302);

        const page = await owner.get('/budget');
        assert.match(page.body, /\$10,000\.00/);
        assert.match(page.body, /\$2,500\.50/);
        assert.match(page.body, /\$7,499\.50/);
        assert.match(page.body, /Added “Venue deposit”/);

        const invalid = await owner.post('/budget/expenses', { name: '', category: 'Bribes', amount: '-1' });
        assert.equal(invalid.status, 400);
        assert.match(invalid.body, /Please fix the following/);

        assert.match(page.body, /Spending by category/);
        assert.match(
            page.body,
            /<details class="card add-panel" id="add-expense" >/,
            'the add form starts closed once there are expenses'
        );

        const filtered = await owner.get('/budget?category=Flowers');
        assert.match(filtered.body, /Nothing matches this filter/);

        const id = idOf(page.body, /\/budget\/expenses\/([0-9a-f-]{36})\/delete/);
        await owner.get('/budget');
        const deleted = await owner.post(`/budget/expenses/${id}/delete`, { return_to: '/budget?category=Venue' });
        assert.equal(deleted.location, '/budget?category=Venue');
        assert.match((await owner.get('/budget')).body, /No expenses yet/);
    });

    it('guests: add, edit, set RSVP, filter and delete', async () => {
        assert.match((await owner.get('/guests')).body, /id="add-guest" open/, 'an empty list opens the add form');
        await owner.post('/guests', { name: 'Jane Smith', rsvp: 'Pending', diet: 'Vegan', plus_one: '' });
        let page = await owner.get('/guests');
        assert.match(page.body, /Diet: Vegan/);
        const id = idOf(page.body, /\/guests\/([0-9a-f-]{36})\/edit/);

        await owner.post(`/guests/${id}/rsvp`, { rsvp: 'Confirmed', return_to: '/guests?rsvp=Pending' });
        const confirmed = await owner.get('/guests?rsvp=Confirmed');
        assert.match(confirmed.body, /Jane Smith/);
        assert.match(confirmed.body, /RSVP for Jane Smith updated/);
        await owner.post(`/guests/${id}/rsvp`, { rsvp: 'Maybe' });
        assert.match((await owner.get('/guests')).body, /Choose one of the options/);

        const edit = await owner.get(`/guests/${id}/edit`);
        assert.match(edit.body, /value="Jane Smith"/);
        const saved = await owner.post(`/guests/${id}/edit`, {
            name: 'Jane Doe',
            rsvp: 'Declined',
            diet: '',
            plus_one: 'John'
        });
        assert.equal(saved.location, '/guests');
        page = await owner.get('/guests');
        assert.match(page.body, /Jane Doe/);
        assert.match(page.body, /Plus-one: John/);
        assert.doesNotMatch(page.body, /Diet:/);

        const invalidEdit = await owner.post(`/guests/${id}/edit`, { name: '', rsvp: 'Maybe' });
        assert.equal(invalidEdit.status, 400);

        await owner.get('/guests');
        await owner.post(`/guests/${id}/delete`);
        assert.match((await owner.get('/guests')).body, /No guests yet/);
    });

    it('checklist: examples, duplicates, toggle, edit and filters', async () => {
        await owner.get('/checklist');
        await owner.post('/checklist/examples');
        let page = await owner.get('/checklist');
        assert.match(page.body, /10 example tasks added/);
        await owner.post('/checklist/examples');
        assert.match((await owner.get('/checklist')).body, /already on your list/);

        const duplicate = await owner.post('/checklist', { text: 'Book the venue', category: 'Venue', due_date: '' });
        assert.equal(duplicate.status, 400);
        assert.match(duplicate.body, /already have a task/);

        await owner.post('/checklist', { text: 'Taste cakes', category: 'Catering', due_date: '2020-01-01' });
        page = await owner.get('/checklist?category=Catering');
        assert.match(page.body, /Overdue/);
        const { rows } = await app.pool.query(`SELECT id FROM checklist_tasks WHERE text = 'Taste cakes';`);
        const id = rows[0].id;
        await owner.post(`/checklist/${id}/toggle`);
        assert.match((await owner.get('/checklist?status=done')).body, /Taste cakes/);
        assert.match((await owner.get('/checklist')).body, /1 of 11 tasks complete/);

        await owner.get(`/checklist/${id}/edit`);
        await owner.post(`/checklist/${id}/edit`, {
            text: 'Taste wedding cakes',
            category: 'Catering',
            due_date: '2030-05-01'
        });
        assert.match((await owner.get('/checklist')).body, /Taste wedding cakes/);
    });

    it('vendors: rejects unsafe links, edits and sets status', async () => {
        await owner.get('/vendors');
        const unsafe = await owner.post('/vendors', {
            name: 'Bloom',
            category: 'Florist',
            status: 'Researching',
            website: 'javascript:alert(1)'
        });
        assert.equal(unsafe.status, 400);

        await owner.post('/vendors', {
            name: 'Bloom',
            category: 'Florist',
            status: 'Researching',
            website: 'https://bloom.example',
            email: 'HELLO@bloom.example',
            phone: '(555) 010-2000',
            notes: 'Deposit <b>paid</b>'
        });
        const page = await owner.get('/vendors');
        assert.match(page.body, /href="https:\/\/bloom.example"/);
        assert.match(page.body, /mailto:hello@bloom.example/);
        assert.match(page.body, /href="tel:5550102000"/);
        assert.match(page.body, /Deposit &lt;b&gt;paid&lt;\/b&gt;/, 'user text is escaped');

        const id = idOf(page.body, /\/vendors\/([0-9a-f-]{36})\/status/);
        await owner.post(`/vendors/${id}/status`, { status: 'Booked' });
        assert.match((await owner.get('/vendors?status=Booked')).body, /Bloom/);
        assert.match((await owner.get('/vendors')).body, /<option value="Booked" selected>/);
    });

    it('another wedding’s records are invisible: unknown or foreign ids are 404s', async () => {
        await owner.get('/guests');
        await owner.post('/guests', { name: 'Private Guest', rsvp: 'Pending' });
        const id = idOf((await owner.get('/guests')).body, /\/guests\/([0-9a-f-]{36})\/edit/);

        assert.equal((await stranger.get(`/guests/${id}/edit`)).status, 404);
        await stranger.get('/guests');
        assert.equal((await stranger.post(`/guests/${id}/delete`)).status, 404);
        assert.equal((await stranger.post(`/guests/${id}/edit`, { name: 'Hacked', rsvp: 'Pending' })).status, 404);
        assert.doesNotMatch((await stranger.get('/guests')).body, /Private Guest/);
        assert.match((await owner.get('/guests')).body, /Private Guest/);

        assert.equal((await owner.get('/guests/not-a-uuid/edit')).status, 404);
        await owner.get('/guests');
        assert.equal((await owner.post("/guests/1' OR '1'='1/delete")).status, 404);
    });

    it('dashboard: getting-started steps track progress and hide unconfigured features', async () => {
        const fresh = await registeredClient(app.baseUrl, 'Fresh', 'fresh@example.com');
        const page = await fresh.get('/');
        assert.match(page.body, /Getting started/);
        assert.match(page.body, /0 of 5 done/);
        assert.doesNotMatch(page.body, /href="\/music"/, 'music is hidden when Spotify is not configured');
        assert.doesNotMatch(page.body, /Join a wedding/, 'joining lives in Settings and on /welcome');
        await fresh.post('/budget/limit', { total: '1000' });
        assert.match((await fresh.get('/')).body, /1 of 5 done/);
    });

    it('dashboard: owner sets the date and sees the countdown and stats', async () => {
        await owner.get('/');
        const nextYear = new Date().getFullYear() + 1;
        assert.equal((await owner.post('/wedding/date', { wedding_date: `${nextYear}-06-13` })).location, '/');
        const page = await owner.get('/');
        assert.match(page.body, /days to go/);
        assert.match(page.body, /countdown__number">\d+</);
        assert.equal((await owner.post('/wedding/date', { wedding_date: 'soon' })).location, '/');
        assert.match((await owner.get('/')).body, /Enter a real date/);
    });

    it('music and inspiration explain when search is not configured', async () => {
        assert.match((await owner.get('/music?q=perfect')).body, /Song search is turned off/);
        assert.match((await owner.get('/inspiration?q=roses')).body, /Photo search is turned off/);
    });
});
