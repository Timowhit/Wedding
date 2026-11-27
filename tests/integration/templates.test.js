import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('templates', { skip: skipWithoutDb }, () => {
    let app;
    let m;

    const newUser = async (email) =>
        (await app.pool.query(`INSERT INTO users (email, display_name) VALUES ($1, 'U') RETURNING id;`, [email]))
            .rows[0].id;
    const newWedding = async (name, date = null) =>
        (await app.pool.query('INSERT INTO weddings (name, wedding_date) VALUES ($1, $2) RETURNING id;', [name, date]))
            .rows[0].id;

    before(async () => {
        app = await startTestApp();
        m = await import('../../src/models/templates.js');
    });
    after(() => app?.close());

    describe('model', () => {
        it('save replaces under the same kind and name', async () => {
            const user = await newUser('m1@example.com');
            const first = await m.saveTemplate(user, 'checklist', 'Standard', [
                { text: 'A', category: 'Venue', daysBefore: 1 }
            ]);
            assert.equal(first.replaced, false);
            const second = await m.saveTemplate(user, 'checklist', 'Standard', [
                { text: 'B', category: 'Venue', daysBefore: 2 },
                { text: 'C', category: 'Other', daysBefore: null }
            ]);
            assert.equal(second.replaced, true);
            assert.equal(second.id, first.id);
            const list = await m.findTemplates(user, 'checklist');
            assert.deepEqual(
                list.map((t) => [t.name, t.item_count]),
                [['Standard', 2]]
            );
            await m.saveTemplate(user, 'schedule', 'Standard', [{ startsAt: '10:00', title: 'Hair' }]);
            assert.equal(await m.countTemplates(user), 2, 'same name, other kind is a separate template');
        });

        it('addChecklistItems skips existing texts and counts them', async () => {
            const wedding = await newWedding('Model wedding');
            const items = [
                { text: 'Book venue', category: 'Venue', dueDate: '2027-01-01' },
                { text: 'Send invites', category: 'Invitations', dueDate: null }
            ];
            assert.deepEqual(await m.addChecklistItems(wedding, items), { added: 2, skipped: 0 });
            assert.deepEqual(await m.addChecklistItems(wedding, items), { added: 0, skipped: 2 });
            const { rows } = await app.pool.query(
                'SELECT text, due_date::text AS due FROM checklist_tasks WHERE wedding_id = $1 ORDER BY text;',
                [wedding]
            );
            assert.deepEqual(rows, [
                { text: 'Book venue', due: '2027-01-01' },
                { text: 'Send invites', due: null }
            ]);
        });

        it('findTemplate is scoped by user', async () => {
            const owner = await newUser('m2@example.com');
            const other = await newUser('m3@example.com');
            const { id } = await m.saveTemplate(owner, 'schedule', 'Day', [{ startsAt: '10:00', title: 'Hair' }]);
            assert.ok(await m.findTemplate(id, owner));
            assert.equal(await m.findTemplate(id, other), null);
            assert.equal(await m.deleteTemplate(id, other), false);
            assert.equal(await m.renameTemplate(id, other, 'Mine now'), false);
        });
    });

    describe('pages', () => {
        const PASSWORD = 'correct horse battery';
        const tokenIn = (body) => body.match(/\/invite\/([0-9a-f-]{36})/)?.[1];
        let planner;
        let client;
        let viewer;
        let ana;
        let mia;
        let noDate;

        const weddingId = async (name) =>
            (await app.pool.query('SELECT id FROM weddings WHERE name = $1;', [name])).rows[0].id;
        const open = (id) => planner.post(`/planner/weddings/${id}/open`);
        const tasksOf = async (id) =>
            (
                await app.pool.query(
                    'SELECT text, due_date::text AS due FROM checklist_tasks WHERE wedding_id = $1 ORDER BY text;',
                    [id]
                )
            ).rows;
        const templateId = async (name, kind = 'checklist') =>
            (await app.pool.query('SELECT id FROM templates WHERE name = $1 AND kind = $2;', [name, kind])).rows[0]?.id;

        before(async () => {
            planner = new TestClient(app.baseUrl);
            await planner.get('/register?as=planner');
            await planner.post('/register', {
                as: 'planner',
                name: 'Tara',
                email: 'tara@example.com',
                password: PASSWORD,
                confirm_password: PASSWORD
            });
            await planner.get('/planner');
            await planner.post('/planner/weddings', { name: 'Ana & Luis', wedding_date: '2027-06-12' });
            await planner.post('/planner/weddings', { name: 'Mia & Theo', wedding_date: '2027-09-04' });
            await planner.post('/planner/weddings', { name: 'No Date Yet', wedding_date: '' });
            ana = await weddingId('Ana & Luis');
            mia = await weddingId('Mia & Theo');
            noDate = await weddingId('No Date Yet');

            await open(ana);
            await planner.get('/settings');
            await planner.post('/settings/invites', { email: '', role: 'client' });
            const clientToken = tokenIn((await planner.get('/settings')).body);
            await planner.post('/settings/invites', { email: '', role: 'viewer' });
            const tokens = [...(await planner.get('/settings')).body.matchAll(/\/invite\/([0-9a-f-]{36})/g)].map(
                (match) => match[1]
            );
            client = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
            await client.get(`/invite/${clientToken}`);
            await client.post(`/invite/${clientToken}/accept`);
            viewer = await registeredClient(app.baseUrl, 'Vera', 'vera@example.com');
            const viewerToken = tokens.find((t) => t !== clientToken);
            await viewer.get(`/invite/${viewerToken}`);
            await viewer.post(`/invite/${viewerToken}/accept`);

            await planner.get('/checklist');
            await planner.post('/checklist', { text: 'Book the venue', category: 'Venue', due_date: '2026-06-12' });
            await planner.post('/checklist', {
                text: 'Send invitations',
                category: 'Invitations',
                due_date: '2027-04-12'
            });
            await planner.post('/checklist', { text: 'Write vows', category: 'Other', due_date: '' });
        });

        it('a planner saves a checklist and fills another wedding with recalculated dates', async () => {
            await planner.get('/checklist');
            const saved = await planner.post('/checklist/template', { name: 'Full service' });
            assert.equal(saved.location, '/checklist');
            assert.match((await planner.get('/checklist')).body, /Saved “Full service”/);

            await open(mia);
            await planner.get('/checklist');
            const applied = await planner.post('/checklist/from-template', {
                template_id: await templateId('Full service')
            });
            assert.equal(applied.location, '/checklist');
            assert.match((await planner.get('/checklist')).body, /Added 3 tasks from “Full service”/);
            assert.deepEqual(await tasksOf(mia), [
                { text: 'Book the venue', due: '2026-09-04' },
                { text: 'Send invitations', due: '2027-07-05' },
                { text: 'Write vows', due: null }
            ]);
        });

        it('applying twice adds nothing new and says how many were skipped', async () => {
            await planner.get('/checklist');
            await planner.post('/checklist/from-template', { template_id: await templateId('Full service') });
            assert.match(
                (await planner.get('/checklist')).body,
                /Added 0 tasks from “Full service”. 3 were already on the list/
            );
            assert.equal((await tasksOf(mia)).length, 3);
        });

        it('a wedding without a date gets tasks without due dates and a notice', async () => {
            await open(noDate);
            await planner.get('/checklist');
            await planner.post('/checklist/from-template', { template_id: await templateId('Full service') });
            assert.match((await planner.get('/checklist')).body, /Set the wedding date/);
            assert.deepEqual(
                (await tasksOf(noDate)).map((t) => t.due),
                [null, null, null]
            );
        });

        it('schedule templates keep times and drop vendor and contact', async () => {
            await open(ana);
            await planner.get('/vendors');
            await planner.post('/vendors', { name: 'DJ Nova', category: 'DJ / Band', status: 'Booked' });
            const vendor = (await app.pool.query(`SELECT id FROM vendors WHERE name = 'DJ Nova';`)).rows[0].id;
            await planner.get('/schedule');
            await planner.post('/schedule', {
                starts_at: '15:30',
                ends_at: '16:00',
                title: 'Ceremony',
                location: 'Garden',
                vendor_id: vendor,
                contact: '555-0100',
                notes: 'Chairs by 15:00',
                contingency: 'Barn if rain'
            });
            await planner.post('/schedule/template', { name: 'Garden day' });
            await open(mia);
            await planner.get('/schedule');
            await planner.post('/schedule/from-template', { template_id: await templateId('Garden day', 'schedule') });
            const { rows } = await app.pool.query(
                `SELECT to_char(starts_at, 'HH24:MI') AS starts, title, location, vendor_id, contact, contingency
                 FROM schedule_items WHERE wedding_id = $1;`,
                [mia]
            );
            assert.deepEqual(rows, [
                {
                    starts: '15:30',
                    title: 'Ceremony',
                    location: 'Garden',
                    vendor_id: null,
                    contact: null,
                    contingency: 'Barn if rain'
                }
            ]);
        });

        it('saving under an existing name replaces it', async () => {
            await open(ana);
            await planner.get('/checklist');
            await planner.post('/checklist', { text: 'Taste the cake', category: 'Catering', due_date: '' });
            await planner.post('/checklist/template', { name: 'Full service' });
            assert.match((await planner.get('/checklist')).body, /Replaced “Full service”/);
            const { rows } = await app.pool.query(
                `SELECT jsonb_array_length(items) AS n FROM templates WHERE name = 'Full service';`
            );
            assert.deepEqual(rows, [{ n: 4 }]);
        });

        it('rename, duplicate name refused, delete', async () => {
            const page = (await planner.get('/templates')).body;
            assert.match(page, /Full service/);
            assert.match(page, /Garden day/);
            const id = await templateId('Garden day', 'schedule');
            await planner.post(`/templates/${id}/rename`, { name: 'Garden wedding day' });
            assert.ok(await templateId('Garden wedding day', 'schedule'));

            await planner.post('/schedule/template', { name: 'Ballroom day' });
            const clash = await planner.post(`/templates/${id}/rename`, { name: 'Ballroom day' });
            assert.equal(clash.status, 400);
            assert.match(clash.body, /already have a template/);
            assert.ok(await templateId('Garden wedding day', 'schedule'));

            await planner.post(`/templates/${id}/delete`);
            assert.equal(await templateId('Garden wedding day', 'schedule'), undefined);
        });

        it('templates are private to the person who saved them', async () => {
            const id = await templateId('Full service');
            const checklist = (await client.get('/checklist')).body;
            assert.doesNotMatch(checklist, /Full service \(\d+ tasks\)/, 'not in the picker');
            const before = (await tasksOf(ana)).length;
            assert.equal((await client.post('/checklist/from-template', { template_id: id })).status, 404);
            assert.equal((await tasksOf(ana)).length, before);
            await client.get('/templates');
            assert.equal((await client.post(`/templates/${id}/rename`, { name: 'Taken' })).status, 404);
            assert.equal((await client.post(`/templates/${id}/delete`)).status, 404);
            assert.ok(await templateId('Full service'));
        });

        it('a corrupt template never breaks the page', async () => {
            const user = (await app.pool.query(`SELECT id FROM users WHERE email = 'tara@example.com';`)).rows[0].id;
            const { rows } = await app.pool.query(
                `INSERT INTO templates (user_id, kind, name, items) VALUES ($1, 'checklist', 'Corrupt', $2::jsonb) RETURNING id;`,
                [
                    user,
                    JSON.stringify([
                        { text: 'Absurd date', category: 'Venue', daysBefore: 1e9 },
                        { text: 'Gone category', category: 'Fireworks', daysBefore: 10 },
                        'junk',
                        null
                    ])
                ]
            );
            await open(ana);
            await planner.get('/checklist');
            const applied = await planner.post('/checklist/from-template', { template_id: rows[0].id });
            assert.equal(applied.status, 302);
            const tasks = await tasksOf(ana);
            assert.deepEqual(
                tasks.filter((t) => ['Absurd date', 'Gone category'].includes(t.text)),
                [
                    { text: 'Absurd date', due: null },
                    { text: 'Gone category', due: '2027-06-02' }
                ]
            );
        });

        it('template actions keep the list filters, and counts read naturally', async () => {
            await open(ana);
            await planner.get('/checklist?category=Venue');
            const page = (await planner.get('/checklist?category=Venue')).body;
            assert.match(
                page,
                /action="\/checklist\/from-template"[\s\S]*?name="return_to" value="\/checklist\?category=Venue"/
            );
            const user = (await app.pool.query(`SELECT id FROM users WHERE email = 'tara@example.com';`)).rows[0].id;
            const { rows } = await app.pool.query(
                `INSERT INTO templates (user_id, kind, name, items) VALUES ($1, 'checklist', 'Just one', $2::jsonb) RETURNING id;`,
                [user, JSON.stringify([{ text: 'Only task', category: 'Other', daysBefore: null }])]
            );
            const applied = await planner.post('/checklist/from-template', {
                template_id: rows[0].id,
                return_to: '/checklist?category=Venue'
            });
            assert.equal(applied.location, '/checklist?category=Venue');
            assert.match((await planner.get('/checklist')).body, /Added 1 task from “Just one”\./);
        });

        it('viewers cannot save or apply', async () => {
            await viewer.get('/checklist');
            assert.notEqual((await viewer.post('/checklist/template', { name: 'Peek' })).status, 200);
            assert.equal(await templateId('Peek'), undefined);
        });

        it('saving an empty list is refused', async () => {
            await open(noDate);
            await planner.get('/schedule');
            await planner.post('/schedule/template', { name: 'Empty' });
            assert.match((await planner.get('/schedule')).body, /nothing to save/i);
            assert.equal(await templateId('Empty', 'schedule'), undefined);
        });

        it('the template limit is enforced', async () => {
            const user = (await app.pool.query(`SELECT id FROM users WHERE email = 'tara@example.com';`)).rows[0].id;
            await app.pool.query(
                `INSERT INTO templates (user_id, kind, name, items)
                 SELECT $1, 'checklist', 'Filler ' || n, '[]'::jsonb FROM generate_series(1, 100) AS n
                 ON CONFLICT DO NOTHING;`,
                [user]
            );
            await open(ana);
            await planner.get('/checklist');
            await planner.post('/checklist/template', { name: 'One too many' });
            assert.match((await planner.get('/checklist')).body, /100 templates/);
            assert.equal(await templateId('One too many'), undefined);
        });
    });
});
