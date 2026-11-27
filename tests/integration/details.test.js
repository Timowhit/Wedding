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

    describe('guest meals and accessibility needs', () => {
        const addGuest = (fields) =>
            ana.post('/guests', { name: '', rsvp: 'Confirmed', diet: '', plus_one: '', group_name: '', ...fields });

        it('a guest has a meal choice and accessibility needs, shown on the list', async () => {
            await ana.get('/guests');
            const added = await addGuest({ name: 'Grandma Rose', meal: 'Fish', accessibility: 'Wheelchair user' });
            assert.equal(added.location, '/guests');
            const page = textOf((await ana.get('/guests')).body);
            assert.match(page, /Grandma Rose.*Meal: Fish.*Access needs: Wheelchair user/);
        });

        it('a meal summary counts everyone not declined, with the meals already used as suggestions', async () => {
            await addGuest({ name: 'Uncle Tom', rsvp: 'Pending', meal: 'Beef', accessibility: '' });
            await addGuest({ name: 'Cousin Sam', rsvp: 'Declined', meal: 'Fish', accessibility: '' });
            await addGuest({ name: 'Aunt May', rsvp: 'Confirmed', meal: '', accessibility: '' });
            const html = (await ana.get('/guests')).body;
            assert.match(textOf(html), /Meals: Beef 1 · Fish 1 · Not chosen 1/);
            assert.match(html, /<datalist id="meal-options">[^]*<option value="Beef">[^]*<option value="Fish">/);
        });

        it('the seating chart flags guests with accessibility needs', async () => {
            const page = (await ana.get('/seating')).body;
            assert.match(page, /Grandma Rose[^]{0,400}class="access-flag"/);
            assert.match(textOf(page), /Access needs: Wheelchair user/);
        });

        it('limits: a meal is up to 60 characters, needs up to 300', async () => {
            await ana.get('/guests');
            assert.equal((await addGuest({ name: 'Long', meal: 'x'.repeat(61), accessibility: '' })).status, 400);
            assert.equal((await addGuest({ name: 'Long', meal: '', accessibility: 'x'.repeat(301) })).status, 400);
        });

        it('editing keeps and changes both fields', async () => {
            const { rows } = await app.pool.query(`SELECT id FROM guests WHERE name = 'Grandma Rose';`);
            const form = await ana.get(`/guests/${rows[0].id}/edit`);
            assert.match(form.body, /name="meal"[^>]*value="Fish"/);
            await ana.post(`/guests/${rows[0].id}/edit`, {
                name: 'Grandma Rose',
                rsvp: 'Confirmed',
                diet: '',
                plus_one: '',
                group_name: '',
                meal: 'Vegetarian',
                accessibility: 'Step-free seat near the door'
            });
            const saved = await app.pool.query(`SELECT meal, accessibility FROM guests WHERE id = $1;`, [rows[0].id]);
            assert.deepEqual(saved.rows[0], { meal: 'Vegetarian', accessibility: 'Step-free seat near the door' });
        });
    });
});
