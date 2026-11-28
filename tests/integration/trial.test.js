import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ');

describe('playground: a private trial, kept on sign-up', { skip: skipWithoutDb }, () => {
    let app;
    const q = (sql, params) => app.pool.query(sql, params);
    const startTrial = async () => {
        const visitor = new TestClient(app.baseUrl);
        await visitor.get('/try');
        const started = await visitor.post('/try', {});
        return { visitor, started };
    };
    // The trial just started is the newest one.
    const latestTrial = async () =>
        (await q(`SELECT id FROM users WHERE is_trial ORDER BY created_at DESC, id LIMIT 1;`)).rows[0]?.id;

    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    it('the landing page and login page offer a trial', async () => {
        const visitor = new TestClient(app.baseUrl);
        assert.match((await visitor.get('/')).body, /href="\/try"/);
        assert.match((await visitor.get('/login')).body, /href="\/try"/);
        assert.match((await visitor.get('/try')).body, /action="\/try"/);
    });

    it('starts a private trial wedding with example data and a banner', async () => {
        const { visitor, started } = await startTrial();
        assert.equal(started.location, '/');
        const page = await visitor.get('/');
        assert.equal(page.status, 200);
        assert.match(textOf(page.body), /nothing here is kept unless you sign up/i);
        assert.match(page.body, /class="trial-banner"[^]*href="\/register"/);
        const counts = (
            await q(
                `SELECT (SELECT COUNT(*) FROM checklist_tasks t WHERE t.wedding_id = w.id)::int AS tasks,
                        (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id)::int AS guests,
                        (SELECT COUNT(*) FROM budget_items b WHERE b.wedding_id = w.id)::int AS expenses,
                        (SELECT COUNT(*) FROM schedule_items s WHERE s.wedding_id = w.id)::int AS schedule,
                        u.is_trial, u.email
                 FROM users u JOIN wedding_members wm ON wm.user_id = u.id JOIN weddings w ON w.id = wm.wedding_id
                 WHERE u.id = $1;`,
                [await latestTrial()]
            )
        ).rows[0];
        assert.ok(
            counts.tasks >= 5 && counts.guests >= 3 && counts.expenses >= 2 && counts.schedule >= 3,
            JSON.stringify(counts)
        );
        assert.equal(counts.is_trial, true);
        assert.match(counts.email, /\.invalid$/, 'never a real address');
    });

    it('a trial cannot invite people, upload files or set a password', async () => {
        const { visitor } = await startTrial();
        await visitor.get('/settings');
        const invite = await visitor.post('/settings/invites', { email: 'friend@example.com', role: 'editor' });
        assert.equal(invite.location, '/register');
        const password = await visitor.post('/settings/password', {
            current_password: 'x',
            new_password: 'correct horse battery',
            confirm_password: 'correct horse battery'
        });
        assert.equal(password.location, '/register');
        assert.equal(
            (await visitor.post('/settings/become-planner', {})).location,
            '/register',
            'no founding spots for trials'
        );
        assert.match(textOf((await visitor.get('/register')).body), /Create your account to do that/);
        const invites = await q(`SELECT COUNT(*)::int AS n FROM wedding_invites;`);
        assert.equal(invites.rows[0].n, 0);
    });

    it('signing up keeps the trial wedding and everything in it', async () => {
        const { visitor } = await startTrial();
        const id = await latestTrial();
        await visitor.get('/checklist');
        await visitor.post('/checklist', {
            text: 'My own trial task',
            category: 'Other',
            due_date: '',
            priority: 'normal'
        });

        const form = await visitor.get('/register');
        assert.equal(form.status, 200, 'a trial can open the sign-up form');
        const signed = await visitor.post('/register', {
            as: 'couple',
            name: 'Tess',
            email: 'tess@example.com',
            password: 'correct horse battery',
            confirm_password: 'correct horse battery'
        });
        assert.equal(signed.status, 302);
        const user = (await q(`SELECT id, is_trial, email, display_name FROM users WHERE email = 'tess@example.com';`))
            .rows[0];
        assert.deepEqual(
            { ...user },
            { id, is_trial: false, email: 'tess@example.com', display_name: 'Tess' },
            'the same account, now real'
        );
        const kept = await q(
            `SELECT w.name FROM weddings w JOIN wedding_members wm ON wm.wedding_id = w.id
             JOIN checklist_tasks t ON t.wedding_id = w.id WHERE wm.user_id = $1 AND t.text = 'My own trial task';`,
            [id]
        );
        assert.equal(kept.rowCount, 1, 'the wedding and its tasks are kept');
        assert.equal(kept.rows[0].name, 'Tess’s Wedding', 'renamed for its owner');
        assert.doesNotMatch((await visitor.get('/')).body, /class="trial-banner"/);
    });

    it('an email already in use is refused and the trial stays a trial', async () => {
        const { visitor } = await startTrial();
        const id = await latestTrial();
        await visitor.get('/register');
        const taken = await visitor.post('/register', {
            as: 'couple',
            name: 'Copy',
            email: 'tess@example.com',
            password: 'correct horse battery',
            confirm_password: 'correct horse battery'
        });
        assert.equal(taken.status, 409);
        assert.equal((await q(`SELECT is_trial FROM users WHERE id = $1;`, [id])).rows[0].is_trial, true);
    });

    it('trials left alone for a day are deleted, with their weddings; real accounts are not', async () => {
        const { visitor } = await startTrial();
        const old = await latestTrial();
        const oldWedding = (await q(`SELECT wedding_id FROM wedding_members WHERE user_id = $1;`, [old])).rows[0]
            .wedding_id;
        await q(`UPDATE users SET last_seen_at = NOW() - INTERVAL '25 hours' WHERE id = $1;`, [old]);
        await q(`UPDATE users SET last_seen_at = NOW() - INTERVAL '25 hours' WHERE email = 'tess@example.com';`);

        await startTrial(); // starting a trial clears expired ones
        assert.equal((await q(`SELECT 1 FROM users WHERE id = $1;`, [old])).rowCount, 0);
        assert.equal((await q(`SELECT 1 FROM weddings WHERE id = $1;`, [oldWedding])).rowCount, 0);
        assert.equal((await q(`SELECT 1 FROM users WHERE email = 'tess@example.com';`)).rowCount, 1);
        const gone = await visitor.get('/');
        assert.notEqual(gone.status, 500, 'an expired trial session ends cleanly');
    });
});
