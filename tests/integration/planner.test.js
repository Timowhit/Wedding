import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const PASSWORD = 'correct horse battery';

/** Registers a planner through the real form. */
const registerPlanner = async (baseUrl, name, email, businessName = '') => {
    const client = new TestClient(baseUrl);
    await client.get('/register?as=planner');
    const response = await client.post('/register', {
        as: 'planner',
        name,
        email,
        business_name: businessName,
        password: PASSWORD,
        confirm_password: PASSWORD
    });
    return { client, response };
};

describe('planner accounts and founding spots', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    it('start page and planner sign-up say "Start now", never "Sign up"', async () => {
        const visitor = new TestClient(app.baseUrl);
        const start = await visitor.get('/start');
        assert.equal(start.status, 200);
        assert.match(start.body, /href="\/register\?as=planner"/);
        assert.match(start.body, /href="\/register\?as=couple"/);
        const form = await visitor.get('/register?as=planner');
        for (const page of [start.body, form.body]) {
            assert.match(page, /Start now/);
            assert.doesNotMatch(page, /Sign up/i);
        }
        assert.match(form.body, /name="business_name"/);
        assert.match(form.body, /<input type="hidden" name="as" value="planner">/);
    });

    it('planner sign-up has no wedding and no founding number yet', async () => {
        const { response } = await registerPlanner(app.baseUrl, 'Paula', 'paula@example.com', 'Paula Events');
        assert.equal(response.status, 302);
        assert.equal(response.location, '/planner');
        const { rows } = await app.pool.query(
            `SELECT u.account_type, u.founding_number, u.business_name,
                    (SELECT COUNT(*)::int FROM wedding_members wm WHERE wm.user_id = u.id) AS memberships
             FROM users u WHERE email = 'paula@example.com';`
        );
        assert.deepEqual(rows[0], {
            account_type: 'planner',
            founding_number: null,
            business_name: 'Paula Events',
            memberships: 0
        });
    });

    it('planners land on /planner after signing in', async () => {
        const client = new TestClient(app.baseUrl);
        await client.get('/login');
        const login = await client.post('/login', { email: 'paula@example.com', password: PASSWORD });
        assert.equal(login.location, '/planner');
    });

    it('a couple can become a planner and keeps their wedding unchanged', async () => {
        const couple = await registeredClient(app.baseUrl, 'Rene', 'rene@example.com');
        assert.match((await couple.get('/settings')).body, /action="\/settings\/become-planner"/);
        const upgraded = await couple.post('/settings/become-planner');
        assert.equal(upgraded.location, '/planner');
        const { rows } = await app.pool.query(
            `SELECT u.account_type, u.founding_number, w.planner_managed
             FROM users u JOIN wedding_members wm ON wm.user_id = u.id JOIN weddings w ON w.id = wm.wedding_id
             WHERE u.email = 'rene@example.com';`
        );
        assert.deepEqual(rows, [{ account_type: 'planner', founding_number: null, planner_managed: false }]);
        assert.doesNotMatch((await couple.get('/settings')).body, /action="\/settings\/become-planner"/);
    });

    it('non-planners get a 404 on the planner dashboard', async () => {
        const couple = await registeredClient(app.baseUrl, 'Ola', 'ola@example.com');
        assert.equal((await couple.get('/planner')).status, 404);
        await couple.get('/');
        assert.equal((await couple.post('/planner/weddings', { name: 'Sneaky' })).status, 404);
    });

    it('a planner with no weddings sees how to claim a founding spot and can open Settings', async () => {
        const planner = new TestClient(app.baseUrl);
        await planner.get('/login');
        await planner.post('/login', { email: 'paula@example.com', password: PASSWORD });
        const dashboard = await planner.get('/planner');
        assert.equal(dashboard.status, 200);
        assert.match(dashboard.body, /Add your first client wedding to claim your founding spot/);
        assert.equal((await planner.get('/')).location, '/planner', 'no wedding yet: back to the planner dashboard');

        const settings = await planner.get('/settings');
        assert.equal(settings.status, 200);
        assert.match(settings.body, /action="\/settings\/business"/);
        assert.doesNotMatch(settings.body, /action="\/settings\/invites"/);
        assert.equal(
            (await planner.post('/settings/appearance', { palette: 'navy', mode: 'light' })).location,
            '/settings'
        );
    });

    it('the first client wedding claims founding #1; later ones do not', async () => {
        const planner = new TestClient(app.baseUrl);
        await planner.get('/login');
        await planner.post('/login', { email: 'paula@example.com', password: PASSWORD });
        await planner.get('/planner');
        const nextYear = new Date().getFullYear() + 1;
        const created = await planner.post('/planner/weddings', {
            name: 'Ana & Luis',
            wedding_date: `${nextYear}-05-02`
        });
        assert.equal(created.location, '/planner');
        const page = await planner.get('/planner');
        assert.match(page.body, /You’re founding planner #1/);
        assert.match(page.body, /Ana &amp; Luis/);

        await planner.post('/planner/weddings', { name: 'Mia & Theo', wedding_date: '' });
        const { rows } = await app.pool.query(
            `SELECT u.founding_number, w.name, w.planner_managed, wm.role
             FROM users u JOIN wedding_members wm ON wm.user_id = u.id JOIN weddings w ON w.id = wm.wedding_id
             WHERE u.email = 'paula@example.com' ORDER BY w.name;`
        );
        assert.deepEqual(rows, [
            { founding_number: 1, name: 'Ana & Luis', planner_managed: true, role: 'owner' },
            { founding_number: 1, name: 'Mia & Theo', planner_managed: true, role: 'owner' }
        ]);
        assert.equal((await planner.post('/planner/weddings', { name: '' })).status, 400);
    });

    it('the overview shows deadlines, decisions and budget per wedding, with filters', async () => {
        const planner = new TestClient(app.baseUrl);
        await planner.get('/login');
        await planner.post('/login', { email: 'paula@example.com', password: PASSWORD });
        const ana = (await app.pool.query(`SELECT id FROM weddings WHERE name = 'Ana & Luis';`)).rows[0].id;
        await app.pool.query(
            `INSERT INTO checklist_tasks (wedding_id, text, category, due_date) VALUES ($1, 'Send invitations', 'Invitations', '2020-01-15');
             INSERT INTO decisions (wedding_id, title, due_date) VALUES ($1, 'Choose the menu', CURRENT_DATE + 10);
             INSERT INTO budget_limits (wedding_id, total) VALUES ($1, 1000);
             INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Venue', 'Venue', 1200);
             INSERT INTO guests (wedding_id, name, rsvp) VALUES ($1, 'Grandma', 'Confirmed'), ($1, 'Uncle', 'Pending');`.replaceAll(
                '$1',
                `'${ana}'`
            )
        );
        await app.pool
            .query(
                `INSERT INTO weddings (name, wedding_date, planner_managed) VALUES ('Past Couple', '2020-06-01', true) RETURNING id;`
            )
            .then(({ rows }) =>
                app.pool.query(
                    `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'owner' FROM users WHERE email = 'paula@example.com';`,
                    [rows[0].id]
                )
            );

        const page = await planner.get('/planner');
        assert.match(page.body, /Send invitations/);
        assert.match(page.body, /Choose the menu/);
        assert.match(page.body, /1 open decision/);
        assert.match(page.body, /\$1,200\.00 of \$1,000\.00/);
        assert.match(page.body, /over budget/i);
        assert.match(page.body, /1 of 2 guests confirmed/);
        assert.match(page.body, /1 overdue task/);
        assert.doesNotMatch(page.body, /<h3 class="card-title">Past Couple<\/h3>/, 'upcoming weddings by default');

        assert.match((await planner.get('/planner?when=past')).body, /Past Couple/);
        const search = await planner.get('/planner?when=all&q=mia');
        // Checked on the cards: the header's wedding switcher always lists every wedding.
        assert.match(search.body, /<h3 class="card-title">Mia &amp; Theo<\/h3>/);
        assert.doesNotMatch(search.body, /<h3 class="card-title">Ana &amp; Luis<\/h3>/);

        const opened = await planner.post(`/planner/weddings/${ana}/open`);
        assert.equal(opened.location, '/');
        assert.match((await planner.get('/')).body, /<option value="[^"]+" selected>Ana &amp; Luis/);
    });

    it('claimFoundingNumber never exceeds 300 under concurrency', async () => {
        const { claimFoundingNumber, countFoundingSpotsLeft } = await import('../../src/models/founding.js');
        const { withTransaction } = await import('../../src/models/db.js');
        const users = await app.pool.query(
            `INSERT INTO users (email, account_type)
             SELECT 'racer' || n || '@example.com', 'planner' FROM generate_series(1, 5) AS n
             RETURNING id;`
        );
        await app.pool.query('UPDATE founding_counter SET next_number = 300;');
        assert.equal(await countFoundingSpotsLeft(), 1);

        const results = await Promise.all(
            users.rows.map(({ id }) => withTransaction((client) => claimFoundingNumber(client, id)))
        );
        assert.deepEqual(
            results.filter((n) => n !== null),
            [300]
        );
        assert.equal(results.filter((n) => n === null).length, 4);
        assert.equal(await countFoundingSpotsLeft(), 0);

        const winner = users.rows[results.indexOf(300)].id;
        assert.equal(
            await withTransaction((client) => claimFoundingNumber(client, winner)),
            null,
            'one number per planner'
        );
    });
});
