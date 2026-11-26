import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const tokenIn = (body) => body.match(/\/invite\/([0-9a-f-]{36})/)?.[1];

describe('weddings, invites and roles', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let partner;
    let guest;
    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Olivia', 'olivia@example.com');
        partner = await registeredClient(app.baseUrl, 'Pat', 'pat@example.com');
        guest = await registeredClient(app.baseUrl, 'Vic', 'vic@example.com');
    });
    after(() => app?.close());

    it('an owner creates a viewer share link that another user can join with', async () => {
        await owner.get('/settings');
        const created = await owner.post('/settings/invites', { email: '', role: 'viewer' });
        assert.equal(created.location, '/settings');
        const settings = await owner.get('/settings');
        assert.match(settings.body, /Share link created/);
        const token = tokenIn(settings.body);
        assert.match(settings.body, new RegExp(`http://planner.test/invite/${token}`), 'links use APP_URL');

        const anonymous = new TestClient(app.baseUrl);
        const invitePage = await anonymous.get(`/invite/${token}`);
        assert.equal(invitePage.status, 200);
        assert.match(invitePage.body, /Olivia invited you/);

        const landing = await guest.get(`/invite/${token}`);
        assert.match(landing.body, /Accept/);
        const accepted = await guest.post(`/invite/${token}/accept`);
        assert.equal(accepted.location, '/');
        const dashboard = await guest.get('/');
        assert.match(dashboard.body, /You joined “Olivia’s Wedding”/);
        assert.match(dashboard.body, /view-only/);
    });

    it('a viewer can look but every change is refused', async () => {
        const guests = await guest.get('/guests');
        assert.equal(guests.status, 200);
        assert.doesNotMatch(guests.body, /action="\/guests"/, 'no add form for viewers');

        const refused = await guest.post('/guests', { name: 'Crasher', rsvp: 'Confirmed' });
        assert.equal(refused.location, '/guests');
        assert.match((await guest.get('/guests')).body, /view-only access/);
        const { rows } = await app.pool.query(`SELECT 1 FROM guests WHERE name = 'Crasher';`);
        assert.equal(rows.length, 0);

        assert.equal((await guest.post('/settings/invites', { email: '', role: 'editor' })).location, '/settings');
        const settings = await guest.get('/settings');
        assert.match(settings.body, /Only the wedding owner can do that/);
        assert.equal(tokenIn(settings.body), undefined, 'viewers never see invite tokens');
    });

    it('email invites only work for the invited address', async () => {
        await owner.get('/settings');
        await owner.post('/settings/invites', { email: 'Pat@Example.com', role: 'editor' });
        const settings = await owner.get('/settings');
        assert.match(settings.body, /Invite for pat@example.com created/);
        const token = tokenIn(settings.body);

        await guest.get(`/invite/${token}`);
        const wrong = await guest.post(`/invite/${token}/accept`);
        assert.equal(wrong.location, `/invite/${token}`);
        assert.match((await guest.get(`/invite/${token}`)).body, /This invite was sent to pat@example.com/);

        const partnerDashboard = await partner.get('/');
        assert.match(partnerDashboard.body, /Invitations waiting for you/);
        await partner.post(`/invite/${token}/accept`);
        assert.match((await partner.get('/')).body, /You joined/);

        await partner.get(`/invite/${token}`);
        const reused = await partner.post(`/invite/${token}/accept`);
        assert.equal(reused.location, `/invite/${token}`, 'email invites are single use');
    });

    it('an editor can change data; the owner manages roles and members', async () => {
        await partner.get('/guests');
        await partner.post('/guests', { name: 'Grandma', rsvp: 'Confirmed' });
        assert.match((await owner.get('/guests')).body, /Grandma/);

        const { rows } = await app.pool.query(`SELECT id FROM users WHERE email = 'vic@example.com';`);
        const vicId = rows[0].id;
        await owner.get('/settings');
        await owner.post(`/settings/members/${vicId}/role`, { role: 'editor' });
        assert.match((await owner.get('/settings')).body, /Role updated/);
        await guest.get('/guests');
        assert.equal((await guest.post('/guests', { name: 'Now allowed', rsvp: 'Pending' })).status, 302);
        assert.match((await guest.get('/guests')).body, /Now allowed/);

        await owner.get('/settings');
        const ownerRow = await app.pool.query(`SELECT id FROM users WHERE email = 'olivia@example.com';`);
        await owner.post(`/settings/members/${ownerRow.rows[0].id}/role`, { role: 'viewer' });
        assert.match(
            (await owner.get('/settings')).body,
            /That member could not be found/,
            'the owner row cannot be changed'
        );
        await owner.post(`/settings/members/${vicId}/role`, { role: 'owner' });
        assert.match((await owner.get('/settings')).body, /That member could not be found/, 'nobody can be made owner');

        await owner.post(`/settings/members/${vicId}/delete`);
        assert.match((await owner.get('/settings')).body, /Member removed/);
        const removed = await guest.get('/guests');
        assert.doesNotMatch(removed.body, /Grandma/, 'removal takes effect on the next request');
    });

    it('members can switch between weddings and leave a wedding they do not own', async () => {
        const settings = await partner.get('/settings');
        assert.match(settings.body, /Pat’s Wedding/);
        assert.match(settings.body, /Olivia’s Wedding/);

        const { rows } = await app.pool.query(`SELECT id FROM weddings WHERE name = 'Pat’s Wedding';`);
        const switched = await partner.post('/wedding/switch', { wedding_id: rows[0].id, return_to: '/guests' });
        assert.equal(switched.location, '/guests');
        assert.doesNotMatch((await partner.get('/guests')).body, /Grandma/);

        const other = await app.pool.query(`SELECT id FROM weddings WHERE name = 'Olivia’s Wedding';`);
        await partner.post('/wedding/switch', { wedding_id: other.rows[0].id, return_to: '/settings' });
        await partner.get('/settings');
        assert.equal((await partner.post('/settings/leave')).location, '/');
        assert.match((await partner.get('/')).body, /You left “Olivia’s Wedding”/);

        const notMember = await partner.post('/wedding/switch', { wedding_id: other.rows[0].id, return_to: '/' });
        assert.equal(notMember.location, '/');
        assert.match((await partner.get('/')).body, /not a member of that wedding/);

        await owner.get('/settings');
        await owner.post('/settings/leave');
        assert.match((await owner.get('/settings')).body, /The owner cannot leave/);
    });

    it('a user removed from their only wedding can create a new one', async () => {
        const solo = await registeredClient(app.baseUrl, 'Solo', 'solo@example.com');
        await app.pool.query(
            `DELETE FROM weddings WHERE id IN (SELECT wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'solo@example.com');`
        );
        assert.equal((await solo.get('/')).location, '/welcome');
        await solo.get('/welcome');
        assert.equal((await solo.post('/weddings', { name: '', wedding_date: '' })).status, 400);
        assert.equal((await solo.post('/weddings', { name: 'Second Try', wedding_date: '2031-09-20' })).location, '/');
        assert.match((await solo.get('/')).body, /“Second Try” is ready to plan/);
    });

    it('join-by-link accepts pasted links and rejects junk', async () => {
        await owner.get('/settings');
        await owner.post('/settings/invites', { email: '', role: 'editor' });
        const token = tokenIn((await owner.get('/settings')).body);
        await guest.get('/');
        const joined = await guest.post('/invites/join', {
            invite_link: `see https://planner.test/invite/${token} !`,
            return_to: '/'
        });
        assert.equal(joined.location, `/invite/${token}`);
        const junk = await guest.post('/invites/join', { invite_link: 'hello', return_to: '/settings' });
        assert.equal(junk.location, '/settings');
    });

    it('signing up from an invite link does not create a wedding of your own', async () => {
        await owner.get('/settings');
        await owner.post('/settings/invites', { email: '', role: 'editor' });
        const token = tokenIn((await owner.get('/settings')).body);

        const newcomer = new TestClient(app.baseUrl);
        await newcomer.get(`/invite/${token}`);
        const registered = await newcomer.register({ name: 'Newcomer', email: 'newcomer@example.com' });
        assert.equal(registered.location, `/invite/${token}`);
        const invitePage = await newcomer.get(`/invite/${token}`);
        assert.match(invitePage.body, /Accept the invite below/);
        assert.match(invitePage.body, /As an editor you can add and change everything/);

        const { rows } = await app.pool.query(
            `SELECT COUNT(*)::int AS n FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'newcomer@example.com';`
        );
        assert.equal(rows[0].n, 0);
        await newcomer.post(`/invite/${token}/accept`);
        const settings = await newcomer.get('/settings');
        assert.doesNotMatch(settings.body, /Newcomer’s Wedding/);
        assert.match(settings.body, /Olivia’s Wedding/);
    });

    it('a planner wedding offers the client role; a couple wedding does not', async () => {
        const petra = await registeredClient(app.baseUrl, 'Petra', 'petra@example.com');
        await petra.get('/settings');
        const refused = await petra.post('/settings/invites', { email: '', role: 'client' });
        assert.equal(refused.status, 400);
        assert.doesNotMatch(refused.body, /<option value="client"/);

        await app.pool.query(
            `UPDATE weddings SET planner_managed = true
             WHERE id IN (SELECT wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'petra@example.com');`
        );
        const settings = await petra.get('/settings');
        assert.match(settings.body, /<option value="client"[^>]*>Client/);
        assert.equal((await petra.post('/settings/invites', { email: '', role: 'client' })).status, 302);
    });

    it('revoked invites stop working', async () => {
        const settings = await owner.get('/settings');
        const inviteId = settings.body.match(/\/settings\/invites\/([0-9a-f-]{36})\/delete/)[1];
        const { rows } = await app.pool.query('SELECT token FROM wedding_invites WHERE id = $1;', [inviteId]);
        await owner.post(`/settings/invites/${inviteId}/delete`);
        assert.equal((await guest.get(`/invite/${rows[0].token}`)).status, 404);
    });
});
