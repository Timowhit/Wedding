import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ');

describe('planning details', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let ben;
    let outsider;
    let weddingId;
    let ids;
    const tasks = async () =>
        (
            await app.pool.query(
                `SELECT id, text, priority, assignee_id FROM checklist_tasks WHERE wedding_id = $1 ORDER BY created_at, id;`,
                [weddingId]
            )
        ).rows;

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        ben = await registeredClient(app.baseUrl, 'Ben', 'ben@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        const rows = (
            await app.pool.query(
                `SELECT u.email, u.id, wm.wedding_id FROM users u JOIN wedding_members wm ON wm.user_id = u.id AND wm.role = 'owner';`
            )
        ).rows;
        ids = Object.fromEntries(rows.map((row) => [row.email, row.id]));
        weddingId = rows.find((row) => row.email === 'ana@example.com').wedding_id;
        await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'editor');`, [
            weddingId,
            ids['ben@example.com']
        ]);
        await ben.get('/');
        await ben.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
    });
    after(() => app?.close());

    describe('checklist priorities and owners', () => {
        it('a task gets a priority and an owner from the wedding, shown on the list', async () => {
            await ana.get('/checklist');
            const added = await ana.post('/checklist', {
                text: 'Book the florist',
                category: 'Flowers',
                due_date: '2027-03-01',
                priority: 'high',
                assignee_id: ids['ben@example.com']
            });
            assert.equal(added.location, '/checklist');
            const [task] = await tasks();
            assert.deepEqual([task.priority, task.assignee_id], ['high', ids['ben@example.com']]);
            const page = textOf((await ana.get('/checklist')).body);
            assert.match(page, /Book the florist.*High priority.*For Ben/);
        });

        it('only members can own a task; priority must be one of the options', async () => {
            await ana.get('/checklist');
            const stranger = await ana.post('/checklist', {
                text: 'Sneaky',
                category: 'Other',
                due_date: '',
                priority: 'normal',
                assignee_id: ids['oli@example.com']
            });
            assert.equal(stranger.status, 400);
            const badPriority = await ana.post('/checklist', {
                text: 'Odd',
                category: 'Other',
                due_date: '',
                priority: 'urgent!!',
                assignee_id: ''
            });
            assert.equal(badPriority.status, 400);
            assert.equal((await tasks()).length, 1);
        });

        it('older forms without the new fields still work: normal priority, nobody', async () => {
            await ana.post('/checklist', { text: 'Order cake', category: 'Catering', due_date: '2027-03-01' });
            const cake = (await tasks()).find((task) => task.text === 'Order cake');
            assert.deepEqual([cake.priority, cake.assignee_id], ['normal', null]);
        });

        it('high priority comes first among tasks due the same day', async () => {
            const page = textOf((await ana.get('/checklist')).body);
            assert.ok(page.indexOf('Book the florist') < page.indexOf('Order cake'));
        });

        it('filters: mine and high priority', async () => {
            const mine = textOf((await ben.get('/checklist?who=me')).body);
            assert.match(mine, /Book the florist/);
            assert.doesNotMatch(mine, /Order cake/);
            assert.doesNotMatch(textOf((await ana.get('/checklist?who=me')).body), /Book the florist/);
            const high = textOf((await ana.get('/checklist?priority=high')).body);
            assert.match(high, /Book the florist/);
            assert.doesNotMatch(high, /Order cake/);
        });

        it('editing changes the priority and owner; the edit form lists the members', async () => {
            const cake = (await tasks()).find((task) => task.text === 'Order cake');
            const form = await ana.get(`/checklist/${cake.id}/edit`);
            assert.match(form.body, new RegExp(`<option value="${ids['ben@example.com']}"`));
            assert.doesNotMatch(form.body, new RegExp(ids['oli@example.com']));
            await ana.post(`/checklist/${cake.id}/edit`, {
                text: 'Order cake',
                category: 'Catering',
                due_date: '2027-03-01',
                priority: 'low',
                assignee_id: ids['ana@example.com']
            });
            const saved = (await tasks()).find((task) => task.id === cake.id);
            assert.deepEqual([saved.priority, saved.assignee_id], ['low', ids['ana@example.com']]);
        });

        it('someone who leaves the wedding no longer shows as an owner', async () => {
            await app.pool.query(`DELETE FROM wedding_members WHERE wedding_id = $1 AND user_id = $2;`, [
                weddingId,
                ids['ben@example.com']
            ]);
            assert.doesNotMatch(textOf((await ana.get('/checklist')).body), /For Ben/);
            await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'editor');`, [
                weddingId,
                ids['ben@example.com']
            ]);
            await outsider.get('/');
        });
    });
});
