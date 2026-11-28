import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

describe('whole-wedding templates', { skip: skipWithoutDb }, () => {
    let app;
    let pia;
    let other;
    let first;
    const q = (sql, params) => app.pool.query(sql, params);
    const templateId = async (name) => (await q(`SELECT id FROM templates WHERE name = $1;`, [name])).rows[0]?.id;
    const setup = async (weddingId) =>
        (
            await q(
                `SELECT
                   (SELECT json_agg(text || '@' || COALESCE(to_char(due_date, 'YYYY-MM-DD'), '-') ORDER BY text) FROM checklist_tasks WHERE wedding_id = $1) AS tasks,
                   (SELECT json_agg(title ORDER BY starts_at) FROM schedule_items WHERE wedding_id = $1) AS schedule,
                   (SELECT json_agg(COALESCE(builtin_key, name) || '=' || COALESCE(planned::text, '-') ORDER BY COALESCE(builtin_key, name))
                      FROM budget_categories WHERE wedding_id = $1 AND planned IS NOT NULL) AS planned,
                   (SELECT json_agg(name || ':' || category ORDER BY name) FROM vendors WHERE wedding_id = $1) AS vendors,
                   (SELECT json_agg(entity || ':' || label ORDER BY label) FROM custom_fields WHERE wedding_id = $1) AS fields;`,
                [weddingId]
            )
        ).rows[0];

    before(async () => {
        app = await startTestApp();
        pia = await registeredClient(app.baseUrl, 'Pia', 'pia@example.com');
        other = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        await q(`UPDATE users SET account_type = 'planner' WHERE email = 'pia@example.com';`);
        first = (
            await q(
                `UPDATE weddings SET wedding_date = '2027-06-12' WHERE id = (
                   SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'pia@example.com')
                 RETURNING id;`
            )
        ).rows[0].id;
        await pia.get('/budget'); // creates the suggested budget categories
        await q(
            `INSERT INTO checklist_tasks (wedding_id, text, category, due_date) VALUES
               ($1, 'Book the venue', 'Venue', '2026-12-12'), ($1, 'Send invitations', 'Invitations', '2027-04-12');
             INSERT INTO schedule_items (wedding_id, starts_at, title) VALUES ($1, '15:00', 'Ceremony'), ($1, '18:00', 'Dinner');
             UPDATE budget_categories SET planned = 9000 WHERE wedding_id = $1 AND builtin_key = 'Venue';
             INSERT INTO budget_categories (wedding_id, name, planned) VALUES ($1, 'Favours', 300);
             INSERT INTO vendors (wedding_id, name, category, status, phone) VALUES ($1, 'Bloom Florals', 'Florist', 'Booked', '555-0100');
             INSERT INTO custom_fields (wedding_id, entity, label, type, options) VALUES ($1, 'guest', 'Side', 'choice', '["Bride","Groom"]');`.replaceAll(
                '$1',
                `'${first}'`
            )
        );
    });
    after(() => app?.close());

    it('saves the whole wedding as a template, listed on the templates page', async () => {
        await pia.get('/templates');
        const saved = await pia.post('/templates/wedding', { name: 'Garden wedding' });
        assert.equal(saved.location, '/templates');
        const template = (await q(`SELECT kind, items FROM templates WHERE name = 'Garden wedding';`)).rows[0];
        assert.equal(template.kind, 'wedding');
        assert.equal(template.items.tasks.length, 2);
        assert.deepEqual(
            template.items.vendors,
            [{ name: 'Bloom Florals', category: 'Florist' }],
            'a vendor’s name and kind, not its contact details or status'
        );
        const page = textOf((await pia.get('/templates')).body);
        assert.match(page, /Whole weddings/);
        assert.match(page, /Garden wedding/);
    });

    it('applies it to another wedding: tasks dated from its day, schedule, budget plan, vendors and fields', async () => {
        await pia.post('/weddings', { name: 'Second', wedding_date: '2028-06-12' });
        const second = (await q(`SELECT id FROM weddings WHERE name = 'Second';`)).rows[0].id;
        await pia.post('/wedding/switch', { wedding_id: second, return_to: '/templates' });
        const page = await pia.get('/templates');
        assert.match(page.body, new RegExp(`action="/templates/${await templateId('Garden wedding')}/apply"`));
        const applied = await pia.post(`/templates/${await templateId('Garden wedding')}/apply`, {});
        assert.equal(applied.location, '/');
        const filled = await setup(second);
        // Templates keep days before the day (182 and 61), so a leap year shifts a date by one.
        assert.deepEqual(filled.tasks, ['Book the venue@2027-12-13', 'Send invitations@2028-04-12']);
        assert.deepEqual(filled.schedule, ['Ceremony', 'Dinner']);
        assert.deepEqual(filled.planned, ['Favours=300.00', 'Venue=9000.00']);
        assert.deepEqual(filled.vendors, ['Bloom Florals:Florist']);
        assert.deepEqual(filled.fields, ['guest:Side']);
        const vendor = (await q(`SELECT status, phone FROM vendors WHERE wedding_id = $1;`, [second])).rows[0];
        assert.deepEqual(vendor, { status: 'Researching', phone: null });

        await pia.post(`/templates/${await templateId('Garden wedding')}/apply`, {});
        assert.deepEqual(await setup(second), filled, 'applying twice adds nothing twice');
    });

    it('a planner can start a client wedding from it', async () => {
        await pia.get('/planner');
        await pia.post('/planner/weddings', {
            name: 'Client from template',
            wedding_date: '2027-09-01',
            template_id: await templateId('Garden wedding')
        });
        const client = (await q(`SELECT id FROM weddings WHERE name = 'Client from template';`)).rows[0].id;
        const filled = await setup(client);
        assert.deepEqual(filled.vendors, ['Bloom Florals:Florist']);
        assert.equal(filled.tasks.length, 2);
    });

    it('only its owner can use a template, and only an editor can apply it', async () => {
        const id = await templateId('Garden wedding');
        await other.get('/templates');
        assert.equal((await other.post(`/templates/${id}/apply`, {})).status, 404);
        const before = await setup(first);
        assert.equal((await pia.post('/templates/not-a-uuid/apply', {})).status, 404);
        assert.deepEqual(await setup(first), before);
    });

    it('a template never overwrites a planned amount the wedding already has', async () => {
        await pia.post('/weddings', { name: 'Third', wedding_date: '2028-01-01' });
        const third = (await q(`SELECT id FROM weddings WHERE name = 'Third';`)).rows[0].id;
        await pia.post('/wedding/switch', { wedding_id: third, return_to: '/budget' });
        await pia.get('/budget');
        await q(`UPDATE budget_categories SET planned = 12000 WHERE wedding_id = $1 AND builtin_key = 'Venue';`, [
            third
        ]);
        await pia.post(`/templates/${await templateId('Garden wedding')}/apply`, {});
        const venue = (
            await q(
                `SELECT planned::float AS p FROM budget_categories WHERE wedding_id = $1 AND builtin_key = 'Venue';`,
                [third]
            )
        ).rows[0].p;
        assert.equal(venue, 12000, 'the couple’s own figure stays');
        const favours = (
            await q(`SELECT planned::float AS p FROM budget_categories WHERE wedding_id = $1 AND name = 'Favours';`, [
                third
            ])
        ).rows[0].p;
        assert.equal(favours, 300, 'a new category gets the template’s plan');
    });

    it('a planner hears when the template they picked could not be used', async () => {
        await pia.get('/planner');
        await pia.post('/planner/weddings', {
            name: 'Missing template',
            wedding_date: '',
            template_id: '00000000-0000-4000-8000-000000000000'
        });
        const page = textOf((await pia.get('/planner')).body);
        assert.match(page, /“Missing template” is ready to plan/);
        assert.match(page, /The template you chose could not be found, so the wedding starts empty/);
    });
});
