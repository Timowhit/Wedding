import { createApp } from './src/app.js';
import { pool, testConnection } from './src/models/db.js';

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || 'production';

const app = createApp();

// Refuse to start without a database: every page needs it, including sessions.
try {
    await testConnection();
} catch (error) {
    console.error('Error connecting to the database:', error.message);
    process.exit(1);
}

const server = app.listen(PORT, () => {
    console.info(`Server is running at http://127.0.0.1:${PORT}`);
    console.info(`Environment: ${NODE_ENV}`);
});

/** Stops accepting connections, lets in-flight requests finish, then closes the pool. */
const shutdown = (signal) => {
    console.info(`${signal} received, shutting down`);
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
