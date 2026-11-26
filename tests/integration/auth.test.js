import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

describe('authentication and security', { skip: skipWithoutDb }, () => {
    let app;
    before(async () => {
        app = await startTestApp();
    });
    after(() => app?.close());

    it('sends security headers and hides the framework', async () => {
        const response = await new TestClient(app.baseUrl).get('/login');
        const csp = response.headers.get('content-security-policy');
        assert.match(csp, /script-src 'self'/);
        assert.match(csp, /frame-ancestors 'self'/);
        assert.doesNotMatch(csp, /unsafe-inline/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('x-powered-by'), null);
    });

    it('sends anonymous visitors to /login and back to the page they wanted', async () => {
        const client = new TestClient(app.baseUrl);
        const blocked = await client.get('/guests?rsvp=Pending');
        assert.equal(blocked.status, 302);
        assert.equal(blocked.location, '/login');

        await client.register({ name: 'Ana', email: 'ana@example.com' });
        const fresh = new TestClient(app.baseUrl);
        await fresh.get('/budget');
        await fresh.get('/login');
        const login = await fresh.post('/login', { email: 'ANA@example.com', password: 'correct horse battery' });
        assert.equal(login.status, 302);
        assert.equal(login.location, '/budget');
    });

    it('registration creates an account with its own wedding', async () => {
        const client = await registeredClient(app.baseUrl, 'Luis', 'luis@example.com');
        const dashboard = await client.get('/');
        assert.equal(dashboard.status, 200);
        assert.match(dashboard.body, /Luis’s Wedding/);
        const { rows } = await app.pool.query(
            `SELECT wm.role FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'luis@example.com';`
        );
        assert.deepEqual(rows, [{ role: 'owner' }]);
    });

    it('rejects duplicate emails, bad input and wrong passwords with the form shown again', async () => {
        const client = new TestClient(app.baseUrl);
        const duplicate = await client.register({ name: 'Other', email: 'luis@example.com' });
        assert.equal(duplicate.status, 409);
        assert.match(duplicate.body, /already registered/);

        await client.get('/register');
        const invalid = await client.post('/register', { name: '', email: 'x', password: 'a', confirm_password: 'b' });
        assert.equal(invalid.status, 400);
        assert.match(invalid.body, /aria-invalid="true"/);

        await client.get('/login');
        const wrong = await client.post('/login', { email: 'luis@example.com', password: 'not the password' });
        assert.equal(wrong.status, 401);
        assert.match(wrong.body, /Invalid email or password/);
        assert.match(wrong.body, /value="luis@example.com"/);
    });

    it('rejects a POST without a valid CSRF token', async () => {
        const client = await registeredClient(app.baseUrl, 'Mia', 'mia@example.com');
        const missing = await client.post('/guests', { _csrf: null, name: 'Sneaky', rsvp: 'Pending' });
        assert.equal(missing.status, 403);
        const wrong = await client.post('/guests', { _csrf: 'f'.repeat(64), name: 'Sneaky', rsvp: 'Pending' });
        assert.equal(wrong.status, 403);
        const { rows } = await app.pool.query(`SELECT 1 FROM guests WHERE name = 'Sneaky';`);
        assert.equal(rows.length, 0);
    });

    it('issues a new session id on login and logout', async () => {
        const client = new TestClient(app.baseUrl);
        await client.get('/login');
        await client.post('/language', { language: 'en', return_to: '/login' }); // creates an anonymous session
        const before = client.cookies.get('fp.sid');
        await client.get('/login');
        await client.post('/login', { email: 'mia@example.com', password: 'correct horse battery' });
        const loggedIn = client.cookies.get('fp.sid');
        assert.ok(before && loggedIn && before !== loggedIn);

        await client.get('/');
        const logout = await client.post('/logout');
        assert.equal(logout.location, '/login');
        assert.notEqual(client.cookies.get('fp.sid'), loggedIn);
        assert.equal((await client.get('/')).status, 302);
    });

    it('upgrades legacy bcrypt hashes to scrypt on login', async () => {
        const legacyHash = await bcrypt.hash('legacy password', 4);
        await app.pool.query(
            `INSERT INTO users (email, password_hash, display_name) VALUES ('old@example.com', $1, 'Old');`,
            [legacyHash]
        );
        const client = new TestClient(app.baseUrl);
        await client.get('/login');
        const login = await client.post('/login', { email: 'old@example.com', password: 'legacy password' });
        assert.equal(login.status, 302);
        const { rows } = await app.pool.query(`SELECT password_hash FROM users WHERE email = 'old@example.com';`);
        assert.doesNotMatch(rows[0].password_hash, /^\$2/);
        assert.match(rows[0].password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);

        // A legacy user without any wedding is sent to /welcome to create or join one.
        const home = await client.get('/');
        assert.equal(home.location, '/welcome');
        assert.equal((await client.get('/welcome')).status, 200);
    });

    it('switches language for visitors and saves it for users', async () => {
        const visitor = new TestClient(app.baseUrl);
        await visitor.get('/login');
        const switched = await visitor.post('/language', { language: 'es', return_to: '/login' });
        assert.equal(switched.location, '/login');
        const page = await visitor.get('/login');
        assert.match(page.body, /<html lang="es">/);
        assert.match(page.body, /Iniciar sesión/);

        const evil = await visitor.post('/language', { language: 'en', return_to: '//evil.example' });
        assert.equal(evil.location, '/');

        const spanishBrowser = await new TestClient(app.baseUrl).request('/login', {
            headers: { 'accept-language': 'es-MX' }
        });
        assert.match(spanishBrowser.body, /<html lang="es">/);
    });

    it('shows Google sign-in as unavailable when it is not configured', async () => {
        const client = new TestClient(app.baseUrl);
        const response = await client.get('/auth/google');
        assert.equal(response.location, '/login');
        assert.equal((await client.get('/auth/google/callback')).status, 404);
    });

    it('renders a translated 404 page', async () => {
        const response = await new TestClient(app.baseUrl).get('/no-such-page');
        assert.equal(response.status, 404);
        assert.match(response.body, /Page not found/);
    });
});
