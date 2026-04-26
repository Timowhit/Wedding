/**
 * @file db/index.js
 * @description PostgreSQL connection pool via `pg`.
 * All query helpers live here so the rest of the app
 * never imports `pg` directly.
 */

"use strict";

const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "forever_planner",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30_000,
  connectionTimeoutMillis:
    Number(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2_000,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL pool error", { error: err.message });
});

/* ── helpers ─────────────────────────────────────────────── */

/**
 * Run a single parameterised query.
 * @param {string}  text    SQL string with $1 … $n placeholders
 * @param {Array}   [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client for multi-statement transactions.
 * Always call client.release() in a finally block.
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = () => pool.connect();

/**
 * Run multiple statements inside a serialisable transaction.
 * Automatically commits on success or rolls back on error.
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Verify the pool can reach the database.
 * Called at startup — throws if connection fails.
 */
const testConnection = async () => {
  const { rows } = await pool.query("SELECT NOW() AS now");
  logger.info("Database connected", { serverTime: rows[0].now });
};

module.exports = { query, getClient, withTransaction, testConnection, pool };
