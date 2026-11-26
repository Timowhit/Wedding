import { Pool } from 'pg';

/**
 * PostgreSQL connection pool. All SQL in the app goes through the default export of this
 * module (models only), so nothing else imports `pg` directly.
 *
 * Connection string format: postgresql://username:password@host:port/database
 */

const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';

/**
 * TLS is strict by default (certificate verified).
 * - DB_CA: your provider's CA certificate (PEM; `\n` sequences are turned into newlines).
 * - DB_SSL_INSECURE=true: keeps encryption but skips certificate verification (troubleshooting only).
 * - DB_SSL_DISABLE=true: plain TCP for a local database without TLS. Refused in production.
 * @returns {boolean|import('tls').ConnectionOptions}
 */
const buildSslOptions = () => {
    if (process.env.DB_SSL_DISABLE === 'true') {
        if (isProduction) throw new Error('DB_SSL_DISABLE=true is not allowed when NODE_ENV=production.');
        return false;
    }
    if (process.env.DB_CA) return { ca: process.env.DB_CA.replace(/\\n/g, '\n') };
    if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
    return true;
};

const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: buildSslOptions(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
});

// An idle client can error (e.g. the server restarts). Without a listener, Node would crash.
pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
});

const compact = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Runs one parameterized query. With NODE_ENV=development and ENABLE_SQL_LOGGING=true, every
 * query is logged with its duration and row count.
 * @param {string} text - SQL with $1..$n placeholders. Never build it from user input.
 * @param {Array} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
    if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_SQL_LOGGING !== 'true') {
        return pool.query(text, params);
    }
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        console.info('Executed query:', {
            text: compact(text),
            duration: `${Date.now() - start}ms`,
            rows: result.rowCount
        });
        return result;
    } catch (error) {
        console.error('Error in query:', { text: compact(text), error: error.message });
        throw error;
    }
};

/**
 * Runs `work` inside a transaction: COMMIT on success, ROLLBACK (and rethrow) on any error.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
const withTransaction = async (work) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Checks that the database is reachable. Throws if it is not, so the server can refuse to start.
 * @returns {Promise<void>}
 */
const testConnection = async () => {
    const result = await pool.query('SELECT NOW() AS current_time');
    console.info('Database connection successful:', result.rows[0].current_time);
};

/** PostgreSQL error codes the app handles. */
const PG_ERRORS = Object.freeze({ UNIQUE_VIOLATION: '23505', FOREIGN_KEY_VIOLATION: '23503' });

const db = { query };

// `pool` is exported for the session store and the migration runner, which need the real Pool.
export { db as default, pool, withTransaction, testConnection, PG_ERRORS };
