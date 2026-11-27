import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

describe('custom fields on guests, vendors and tasks', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let outsider;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);
    const fieldId = async (label) =>
        (await q(`SELECT id FROM custom_fields WHERE wedding_id = $1 AND label = $2;`, [weddingId, label])).rows[0]?.id;

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Fay', 'fay@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        weddingId = (
            await q(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'fay@example.com';`
            )
        ).rows[0].wedding_id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'viewer' FROM users WHERE email = 'vik@example.com';`,
            [weddingId]
        );
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        await owner.get('/fields');
    });
    after(() => app?.close());

    it('editors add fields of each type to guests, vendors and tasks', async () => {
        const page = await owner.get('/fields');
        assert.equal(page.status, 200);
        assert.match(page.body, /href="\/fields"/, 'in the menu');
        for (const field of [
            { entity: 'guest', label: 'Hotel block', type: 'text', options: '' },
            { entity: 'guest', label: 'Shuttle needed', type: 'yesno', options: '' },
            { entity: 'guest', label: 'Side', type: 'choice', options: 'Bride\nGroom\nBoth' },
            { entity: 'vendor', label: 'Crew size', type: 'number', options: '' },
            { entity: 'task', label: 'Stage', type: 'choice', options: 'Quoted\nBooked\nConfirmed' }
        ]) {
            assert.equal((await owner.post('/fields', field)).location, '/fields', field.label);
        }
        const text = textOf((await owner.get('/fields')).body);
        assert.match(text, /Hotel block/);
        assert.match(text, /Crew size/);
    });

    it('refuses a duplicate label, a choice without two options and unknown types', async () => {
        assert.equal(
            (await owner.post('/fields', { entity: 'guest', label: 'hotel BLOCK', type: 'text' })).status,
            400
        );
        assert.equal(
            (await owner.post('/fields', { entity: 'guest', label: 'Colour', type: 'choice', options: 'Red' })).status,
            400
        );
        assert.equal((await owner.post('/fields', { entity: 'guest', label: 'X', type: 'date' })).status, 400);
        assert.equal((await owner.post('/fields', { entity: 'venue', label: 'X', type: 'text' })).status, 400);
    });

    it('a guest is added and edited with its custom values, shown in the list', async () => {
        const hotel = await fieldId('Hotel block');
        const shuttle = await fieldId('Shuttle needed');
        const side = await fieldId('Side');
        const form = (await owner.get('/guests')).body;
        assert.match(form, new RegExp(`name="cf_${hotel}"`), 'the add form has the field');
        await owner.post('/guests', {
            name: 'Gwen',
            rsvp: 'Pending',
            diet: '',
            plus_one: '',
            group_name: '',
            meal: '',
            accessibility: '',
            [`cf_${hotel}`]: 'Riverside Inn',
            [`cf_${shuttle}`]: 'yes',
            [`cf_${side}`]: 'Bride'
        });
        const guest = (await q(`SELECT id, custom FROM guests WHERE name = 'Gwen';`)).rows[0];
        assert.deepEqual(guest.custom, { [hotel]: 'Riverside Inn', [shuttle]: true, [side]: 'Bride' });
        assert.match(textOf((await owner.get('/guests')).body), /Hotel block: Riverside Inn/);

        const edit = await owner.get(`/guests/${guest.id}/edit`);
        assert.match(edit.body, new RegExp(`name="cf_${hotel}"[^>]*value="Riverside Inn"`));
        const bad = await owner.post(`/guests/${guest.id}/edit`, {
            name: 'Gwen',
            rsvp: 'Pending',
            [`cf_${side}`]: 'Neighbour'
        });
        assert.equal(bad.status, 400, 'a choice must be one of its options');
        assert.match(textOf(bad.body), /Side:/, 'the error names the field by its label');
        await owner.post(`/guests/${guest.id}/edit`, { name: 'Gwen', rsvp: 'Pending', [`cf_${hotel}`]: '' });
        const cleared = (await q(`SELECT custom FROM guests WHERE id = $1;`, [guest.id])).rows[0].custom;
        assert.deepEqual(cleared, {}, 'empty values are not kept');
    });

    it('vendors and tasks take their own fields; a number must be a number', async () => {
        const crew = await fieldId('Crew size');
        const stage = await fieldId('Stage');
        await owner.get('/vendors');
        const bad = await owner.post('/vendors', {
            name: 'Bloom',
            category: 'Florist',
            status: 'Researching',
            [`cf_${crew}`]: 'many'
        });
        assert.equal(bad.status, 400);
        await owner.post('/vendors', {
            name: 'Bloom',
            category: 'Florist',
            status: 'Researching',
            [`cf_${crew}`]: '4'
        });
        assert.deepEqual((await q(`SELECT custom FROM vendors WHERE name = 'Bloom';`)).rows[0].custom, { [crew]: 4 });
        await owner.get('/checklist');
        await owner.post('/checklist', {
            text: 'Book band',
            category: 'Other',
            due_date: '',
            priority: 'normal',
            [`cf_${stage}`]: 'Quoted'
        });
        assert.deepEqual((await q(`SELECT custom FROM checklist_tasks WHERE text = 'Book band';`)).rows[0].custom, {
            [stage]: 'Quoted'
        });
        assert.match(textOf((await owner.get('/checklist')).body), /Stage: Quoted/);
    });

    it('deleting a field removes its values', async () => {
        const hotel = await fieldId('Hotel block');
        const shuttle = await fieldId('Shuttle needed');
        await owner.post(`/fields/${shuttle}/delete`, {});
        assert.equal(await fieldId('Shuttle needed'), undefined);
        const left = (await q(`SELECT custom FROM guests WHERE name = 'Gwen';`)).rows[0].custom;
        assert.ok(!(shuttle in left));
        assert.ok(hotel);
    });

    it('viewers see values but cannot change fields; other weddings get 404', async () => {
        const page = (await viewer.get('/fields')).body;
        assert.doesNotMatch(page, /action="\/fields"/);
        await viewer.post('/fields', { entity: 'guest', label: 'Sneaky', type: 'text' });
        assert.equal(await fieldId('Sneaky'), undefined);
        const side = await fieldId('Side');
        await outsider.get('/fields');
        assert.equal((await outsider.post(`/fields/${side}/delete`, {})).status, 404);
        // A value for another wedding's field is ignored.
        await outsider.get('/guests');
        await outsider.post('/guests', { name: 'Ollie', rsvp: 'Pending', [`cf_${side}`]: 'Bride' });
        assert.deepEqual((await q(`SELECT custom FROM guests WHERE name = 'Ollie';`)).rows[0].custom, {});
    });
});
