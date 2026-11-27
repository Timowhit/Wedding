import db from './db.js';
import { FOUNDING_SPOTS } from '../constants.js';

/**
 * Founding planner numbers (1..FOUNDING_SPOTS). One row in founding_counter holds the next number;
 * locking it with SELECT ... FOR UPDATE makes concurrent claims take turns, and the UNIQUE
 * constraint on users.founding_number is the final guard.
 */

/**
 * Gives a planner the next founding number, if any are left. Must run inside the transaction that
 * creates the planner's first planner wedding, so the number and the wedding commit together.
 * @param {import('pg').PoolClient} client - A client inside an open transaction.
 * @param {string} userId
 * @returns {Promise<number|null>} The new number, or null when the user already has one, is not a
 *          planner, or every spot is taken.
 */
const claimFoundingNumber = async (client, userId) => {
    const user = await client.query(`SELECT founding_number, account_type FROM users WHERE id = $1 FOR UPDATE;`, [
        userId
    ]);
    const row = user.rows[0];
    if (!row || row.account_type !== 'planner' || row.founding_number !== null) return null;

    const counter = await client.query('SELECT next_number FROM founding_counter FOR UPDATE;');
    const number = counter.rows[0].next_number;
    if (number > FOUNDING_SPOTS) return null;

    await client.query('UPDATE users SET founding_number = $2 WHERE id = $1;', [userId, number]);
    await client.query('UPDATE founding_counter SET next_number = $1;', [number + 1]);
    return number;
};

/**
 * @returns {Promise<number>} Founding spots still available (0 when the offer has ended).
 */
const countFoundingSpotsLeft = async () => {
    const result = await db.query('SELECT next_number FROM founding_counter;');
    const next = result.rows[0]?.next_number ?? 1;
    return Math.max(0, FOUNDING_SPOTS - (next - 1));
};

export { claimFoundingNumber, countFoundingSpotsLeft };
