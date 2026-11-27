import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

/** The values offered in the expense form's category list. */
const expenseOptions = (html) => {
    const select = /<select id="category" name="category"[^>]*>([^]*?)<\/select>/.exec(html)?.[1] ?? '';
    return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
};

describe('budget categories', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let viewer;
    let outsider;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);
    const categoryId = async (value) =>
        (
            await q(`SELECT id FROM budget_categories WHERE wedding_id = $1 AND COALESCE(builtin_key, name) = $2;`, [
                weddingId,
                value
            ])
        ).rows[0]?.id;

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
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
    });
    after(() => app?.close());

    it('a wedding starts with the suggested categories, Decorations included and Other last', async () => {
        const options = expenseOptions((await ana.get('/budget')).body);
        assert.ok(options.includes('Venue'));
        assert.ok(options.includes('Decorations'));
        assert.equal(options.at(-1), 'Other');
    });

    it('an editor adds a category with a planned amount and uses it for an expense', async () => {
        await ana.get('/budget');
        const added = await ana.post('/budget/categories', { name: 'Cake tasting', planned: '500' });
        assert.equal(added.location, '/budget');
        const page = await ana.get('/budget');
        assert.ok(expenseOptions(page.body).includes('Cake tasting'));
        assert.equal(
            (await ana.post('/budget/expenses', { name: 'Tasting fee', category: 'Cake tasting', amount: '120' }))
                .status,
            302
        );
        const text = textOf((await ana.get('/budget')).body);
        assert.match(text, /Cake tasting \$120\.00 of \$500\.00 planned/);
    });

    it('a name already in the list (any capitals) is refused; a suggested name brings that one back', async () => {
        const dupe = await ana.post('/budget/categories', { name: 'CAKE TASTING', planned: '' });
        assert.equal(dupe.status, 400);
        assert.match(dupe.body, /aria-invalid="true"/);

        await ana.post(`/budget/categories/${await categoryId('Honeymoon')}/delete`, {});
        assert.equal(await categoryId('Honeymoon'), undefined);
        // Typing a suggested category's name (in either language) restores it rather than adding a copy.
        await ana.post('/budget/categories', { name: 'luna de miel', planned: '' });
        assert.ok(await categoryId('Honeymoon'));
        const custom = await q(
            `SELECT COUNT(*)::int AS n FROM budget_categories WHERE wedding_id = $1 AND name IS NOT NULL;`,
            [weddingId]
        );
        assert.equal(custom.rows[0].n, 1, 'only Cake tasting is custom');
    });

    it('sets a planned amount for a suggested category', async () => {
        await ana.post(`/budget/categories/${await categoryId('Venue')}/plan`, { planned: '8000' });
        assert.match(textOf((await ana.get('/budget')).body), /Venue \$0\.00 of \$8,000\.00 planned/);
        assert.equal(
            (await ana.post(`/budget/categories/${await categoryId('Venue')}/plan`, { planned: 'lots' })).status,
            400
        );
        await ana.post(`/budget/categories/${await categoryId('Venue')}/plan`, { planned: '' });
        assert.doesNotMatch(textOf((await ana.get('/budget')).body), /of \$8,000\.00 planned/, 'cleared');
    });

    it('deleting a category moves its expenses to Other; Other cannot be deleted', async () => {
        await ana.post(`/budget/categories/${await categoryId('Cake tasting')}/delete`, {});
        const expense = await q(`SELECT category FROM budget_items WHERE name = 'Tasting fee';`);
        assert.equal(expense.rows[0].category, 'Other');
        assert.ok(!expenseOptions((await ana.get('/budget')).body).includes('Cake tasting'));
        assert.equal((await ana.post(`/budget/categories/${await categoryId('Other')}/delete`, {})).status, 404);
        assert.ok(await categoryId('Other'));
    });

    it('"Add suggested categories" brings back the ones deleted', async () => {
        await ana.post(`/budget/categories/${await categoryId('Flowers')}/delete`, {});
        assert.match((await ana.get('/budget')).body, /action="\/budget\/categories\/suggested"/);
        await ana.post('/budget/categories/suggested', {});
        assert.ok(await categoryId('Flowers'));
        assert.doesNotMatch(
            (await ana.get('/budget')).body,
            /action="\/budget\/categories\/suggested"/,
            'none missing'
        );
    });

    it('an expense must use one of the wedding’s categories', async () => {
        const bad = await ana.post('/budget/expenses', { name: 'Bribe', category: 'Bribes', amount: '10' });
        assert.equal(bad.status, 400);
    });

    it('viewers cannot change categories; other weddings get 404', async () => {
        await viewer.get('/budget');
        await viewer.post('/budget/categories', { name: 'Sneaky', planned: '' });
        await viewer.post(`/budget/categories/${await categoryId('Venue')}/delete`, {});
        assert.ok(await categoryId('Venue'));
        assert.equal(await categoryId('Sneaky'), undefined);
        assert.doesNotMatch((await viewer.get('/budget')).body, /action="\/budget\/categories"/);
        await outsider.get('/budget');
        assert.equal((await outsider.post(`/budget/categories/${await categoryId('Venue')}/delete`, {})).status, 404);
        assert.equal(
            (await outsider.post(`/budget/categories/${await categoryId('Venue')}/plan`, { planned: '1' })).status,
            404
        );
    });
});
