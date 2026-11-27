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
});
