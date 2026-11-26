import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const PASSWORD = 'correct horse battery';
const tokenIn = (body) => body.match(/\/invite\/([0-9a-f-]{36})/)?.[1];

describe('decisions', { skip: skipWithoutDb }, () => {
    let app;
    let planner;
    let client;
    let viewer;
    let decisionId;

    const statusOf = async (id) =>
        (await app.pool.query('SELECT status, comment FROM decisions WHERE id = $1;', [id])).rows[0];

    before(async () => {
        app = await startTestApp();
        planner = new TestClient(app.baseUrl);
        await planner.get('/register?as=planner');
        await planner.post('/register', {
            as: 'planner',
            name: 'Pat',
            email: 'pat@example.com',
            password: PASSWORD,
            confirm_password: PASSWORD
        });
        await planner.get('/planner');
        await planner.post('/planner/weddings', { name: 'Cora & Ben', wedding_date: '' });
        await planner.get('/settings');
        await planner.post('/settings/invites', { email: '', role: 'client' });
        const clientToken = tokenIn((await planner.get('/settings')).body);
        await planner.post('/settings/invites', { email: '', role: 'viewer' });
        const tokens = [...(await planner.get('/settings')).body.matchAll(/\/invite\/([0-9a-f-]{36})/g)].map(
            (m) => m[1]
        );
        const viewerToken = tokens.find((t) => t !== clientToken);

        client = await registeredClient(app.baseUrl, 'Cora', 'cora@example.com');
        await client.get(`/invite/${clientToken}`);
        await client.post(`/invite/${clientToken}/accept`);
        viewer = await registeredClient(app.baseUrl, 'Vic', 'vic@example.com');
        await viewer.get(`/invite/${viewerToken}`);
        await viewer.post(`/invite/${viewerToken}/accept`);
    });
    after(() => app?.close());

    it('the planner asks a decision and the couple see it waiting', async () => {
        await planner.get('/decisions');
        const created = await planner.post('/decisions', {
            title: 'Choose the ceremony music',
            details: 'Pick one of the three pieces we listened to.',
            due_date: '2031-01-15'
        });
        assert.equal(created.location, '/decisions');
        decisionId = (await app.pool.query(`SELECT id FROM decisions WHERE title = 'Choose the ceremony music';`))
            .rows[0].id;

        const page = await client.get('/decisions');
        assert.match(page.body, /Choose the ceremony music/);
        assert.match(page.body, /action="\/decisions\/[0-9a-f-]{36}\/answer"/);
        assert.match((await client.get('/')).body, /1 decision waiting for you/);
        assert.doesNotMatch((await planner.get('/decisions')).body, /\/answer"/, 'the planner does not answer');
    });

    it('asking needs a title', async () => {
        await planner.get('/decisions');
        assert.equal((await planner.post('/decisions', { title: '', details: '' })).status, 400);
    });

    it('requesting changes needs a comment; approving does not', async () => {
        await client.get('/decisions');
        const missing = await client.post(`/decisions/${decisionId}/answer`, {
            status: 'changes_requested',
            comment: ''
        });
        assert.equal(missing.status, 400);
        assert.equal((await statusOf(decisionId)).status, 'open');

        await client.post(`/decisions/${decisionId}/answer`, {
            status: 'changes_requested',
            comment: 'Something softer, please'
        });
        assert.deepEqual(await statusOf(decisionId), {
            status: 'changes_requested',
            comment: 'Something softer, please'
        });
        assert.match((await planner.get('/decisions')).body, /Something softer, please/);
    });

    it('the planner can reopen a decision, which clears the answer', async () => {
        await planner.get('/decisions');
        await planner.post(`/decisions/${decisionId}/reopen`);
        assert.deepEqual(await statusOf(decisionId), { status: 'open', comment: null });
        await client.get('/decisions');
        await client.post(`/decisions/${decisionId}/answer`, { status: 'approved', comment: '' });
        assert.equal((await statusOf(decisionId)).status, 'approved');
    });

    it('viewers, and the planner side in a planner wedding, cannot answer; clients cannot ask', async () => {
        await planner.post(`/decisions/${decisionId}/reopen`);
        await viewer.get('/decisions');
        assert.equal(
            (await viewer.post(`/decisions/${decisionId}/answer`, { status: 'approved' })).location,
            '/decisions'
        );
        await planner.get('/decisions');
        assert.equal(
            (await planner.post(`/decisions/${decisionId}/answer`, { status: 'approved' })).location,
            '/decisions'
        );
        assert.equal((await statusOf(decisionId)).status, 'open');

        await client.get('/decisions');
        assert.equal((await client.post('/decisions', { title: 'Sneaky' })).location, '/decisions');
        assert.equal((await app.pool.query(`SELECT 1 FROM decisions WHERE title = 'Sneaky';`)).rowCount, 0);
    });

    it('the planner edits and deletes decisions', async () => {
        await planner.get(`/decisions/${decisionId}/edit`);
        const saved = await planner.post(`/decisions/${decisionId}/edit`, {
            title: 'Choose the processional',
            details: '',
            due_date: ''
        });
        assert.equal(saved.location, '/decisions');
        assert.match((await client.get('/decisions')).body, /Choose the processional/);
        await planner.get('/decisions');
        await planner.post(`/decisions/${decisionId}/delete`);
        assert.equal((await app.pool.query('SELECT 1 FROM decisions WHERE id = $1;', [decisionId])).rowCount, 0);
    });

    it("in a couple's own wedding both partners can ask and answer", async () => {
        const ola = await registeredClient(app.baseUrl, 'Ola', 'ola@example.com');
        await ola.get('/decisions');
        await ola.post('/decisions', { title: 'Pick the cake flavour' });
        const id = (await app.pool.query(`SELECT id FROM decisions WHERE title = 'Pick the cake flavour';`)).rows[0].id;
        await ola.post(`/decisions/${id}/answer`, { status: 'approved' });
        assert.equal((await statusOf(id)).status, 'approved');
    });

    it('decisions from another wedding are not found', async () => {
        const other = await registeredClient(app.baseUrl, 'Zed', 'zed@example.com');
        const id = (await app.pool.query(`SELECT id FROM decisions WHERE title = 'Pick the cake flavour';`)).rows[0].id;
        await other.get('/decisions');
        assert.equal((await other.get(`/decisions/${id}/edit`)).status, 404);
        assert.equal(
            (await other.post(`/decisions/${id}/answer`, { status: 'changes_requested', comment: 'x' })).status,
            404
        );
    });
});
