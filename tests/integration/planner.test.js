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
