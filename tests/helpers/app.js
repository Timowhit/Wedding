/**
 * Integration-test harness: a real app on a random port, backed by a real PostgreSQL database.
 *
 * Set TEST_DB_URL to an EMPTY database you do not care about: every test file wipes its
 * public schema and re-runs all migrations. Without TEST_DB_URL the integration tests skip.
 */
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

const TEST_DB_URL = process.env.TEST_DB_URL;

/** Use as `describe('x', { skip: skipWithoutDb }, ...)`. */
const skipWithoutDb = TEST_DB_URL ? false : 'TEST_DB_URL is not set (see README: Running tests)';

// The client below always talks to the test server with the real fetch, even when a test
// replaces globalThis.fetch to fake Spotify or Unsplash.
const realFetch = globalThis.fetch;

/**
 * Starts the app. Environment is set before the app modules load, because db.js reads it at import.
 * @returns {Promise<{baseUrl: string, pool: import('pg').Pool, close: () => Promise<void>}>}
 */
const startTestApp = async (extraEnv = {}) => {
    Object.assign(process.env, {
        NODE_ENV: 'test',
        DB_URL: TEST_DB_URL,
        DB_SSL_DISABLE: process.env.TEST_DB_SSL_DISABLE ?? 'true',
        SESSION_SECRET: randomBytes(32).toString('hex'),
        APP_URL: 'http://planner.test',
        ...extraEnv
    });

    const { pool } = await import('../../src/models/db.js');
    const { migrate } = await import('../../src/db/migrate.js');
    const { createApp } = await import('../../src/app.js');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);

    const server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    return {
        baseUrl,
        pool,
        close: async () => {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
            await pool.end();
        }
    };
};

/**
 * A browser-like client: keeps the session cookie, reads CSRF tokens from pages, never follows redirects.
 */
class TestClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cookies = new Map();
        this.csrfToken = null;
    }

    async request(path, options = {}) {
        const headers = { ...options.headers };
        if (this.cookies.size > 0) {
            headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        }
        const response = await realFetch(`${this.baseUrl}${path}`, { ...options, headers, redirect: 'manual' });
        for (const cookie of response.headers.getSetCookie()) {
            const [pair] = cookie.split(';');
            const [name, ...rest] = pair.split('=');
            this.cookies.set(name, rest.join('='));
        }
        const body = await response.text();
        const token = body.match(/name="_csrf" value="([0-9a-f]+)"/);
        if (token) this.csrfToken = token[1];
        return { status: response.status, headers: response.headers, body, location: response.headers.get('location') };
    }

    get(path) {
        return this.request(path);
    }

    /** Posts a form. Fetches a page first when no CSRF token is known yet. Pass _csrf: null to omit it. */
    async post(path, fields = {}) {
        if (!this.csrfToken && !('_csrf' in fields)) await this.get('/login');
        const form = { _csrf: this.csrfToken, ...fields };
        const body = new URLSearchParams(Object.entries(form).filter(([, value]) => value !== null));
        return this.request(path, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body
        });
    }

    /** Registers and logs in a new account. */
    async register({ name, email, password = 'correct horse battery' }) {
        await this.get('/register');
        return this.post('/register', { name, email, password, confirm_password: password });
    }
}

/** Shorthand: a fresh client that is registered and logged in. */
const registeredClient = async (baseUrl, name, email) => {
    const client = new TestClient(baseUrl);
    const response = await client.register({ name, email });
    if (response.status !== 302) throw new Error(`Registration of ${email} failed with ${response.status}`);
    await client.get('/');
    return client;
};

export { skipWithoutDb, startTestApp, TestClient, registeredClient, realFetch };
