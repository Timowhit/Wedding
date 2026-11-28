import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ');

describe('task progress badge and celebrations', { skip: skipWithoutDb }, () => {
    let app;
    let ana;
    let weddingId;
    const taskId = async (text) =>
        (await app.pool.query(`SELECT id FROM checklist_tasks WHERE wedding_id = $1 AND text = $2;`, [weddingId, text]))
            .rows[0].id;

    before(async () => {
        app = await startTestApp();
        ana = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        weddingId = (
            await app.pool.query(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'ana@example.com';`
            )
        ).rows[0].wedding_id;
        await app.pool.query(
            `INSERT INTO checklist_tasks (wedding_id, text, category, due_date) VALUES
             ($1, 'Book venue', 'Venue', '2027-01-01'), ($1, 'Book band', 'Other', '2027-02-01'),
             ($1, 'Order cake', 'Catering', '2027-03-01'), ($1, 'Buy rings', 'Other', NULL);`,
            [weddingId]
        );
    });
    after(() => app?.close());

    it('the header shows checklist progress and the next tasks on every wedding page', async () => {
        const page = await ana.get('/budget');
        assert.match(page.body, /class="task-badge"/);
        assert.match(textOf(page.body), /0 of 4 tasks done/);
        assert.match(textOf(page.body), /Book venue.*Book band.*Order cake/);
        assert.doesNotMatch(page.body, /data-celebrate/);
    });

    it('ticking a task off celebrates once, with the milestone reached', async () => {
        await ana.get('/checklist');
        await ana.post(`/checklist/${await taskId('Book venue')}/toggle`, {});
        // A background request (the offline worker, another tab's fetch) must not use it up.
        await ana.request('/schedule', { headers: { 'x-fp-background': '1' } });
        const first = await ana.get('/checklist');
        assert.match(first.body, /data-celebrate/);
        assert.match(
            first.body,
            /class="flash flash--success"[^>]*data-autohide[^]*?1 of 4 done \(25%\)/,
            'the message is a fading notice'
        );
        assert.doesNotMatch((await ana.get('/checklist')).body, /data-celebrate/, 'only once');

        await ana.post(`/checklist/${await taskId('Book band')}/toggle`, {});
        assert.match(textOf((await ana.get('/checklist')).body), /Halfway there/);
    });

    it('unticking does not celebrate', async () => {
        await ana.post(`/checklist/${await taskId('Book band')}/toggle`, {});
        assert.doesNotMatch((await ana.get('/checklist')).body, /data-celebrate/);
    });

    it('ticking it again celebrates, but not the milestone a second time', async () => {
        await ana.post(`/checklist/${await taskId('Book band')}/toggle`, {});
        const page = (await ana.get('/checklist')).body;
        assert.match(page, /data-celebrate/);
        assert.doesNotMatch(page, /celebrate--milestone/);
        assert.doesNotMatch(textOf(page), /Halfway there/);
        assert.match(textOf(page), /Nice work!/);
        await ana.post(`/checklist/${await taskId('Book band')}/toggle`, {}); // back to how it was
    });

    it('everything done: the big one', async () => {
        for (const text of ['Book band', 'Order cake', 'Buy rings']) {
            await ana.post(`/checklist/${await taskId(text)}/toggle`, {});
        }
        const page = textOf((await ana.get('/checklist')).body);
        assert.match(page, /Every task is done/);
        assert.match(page, /4 of 4 tasks done/);
    });

    it('the celebration belongs to its wedding', async () => {
        await ana.post('/weddings', { name: 'Second wedding', wedding_date: '' });
        await app.pool.query(`UPDATE checklist_tasks SET done = false WHERE wedding_id = $1 AND text = 'Buy rings';`, [
            weddingId
        ]);
        await ana.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        await ana.get('/checklist');
        await ana.post(`/checklist/${await taskId('Buy rings')}/toggle`, {});
        const other = (await app.pool.query(`SELECT id FROM weddings WHERE name = 'Second wedding';`)).rows[0].id;
        await ana.post('/wedding/switch', { wedding_id: other, return_to: '/' });
        assert.doesNotMatch((await ana.get('/')).body, /data-celebrate/, 'not shown in another wedding');
    });
});
