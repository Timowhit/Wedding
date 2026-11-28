import db from './db.js';

// Columns that are safe to load into a session or a view. Never includes password_hash.
const PUBLIC_COLUMNS = `id, email, display_name, avatar_url, language, created_at, account_type, founding_number,
                        business_name, theme_palette, theme_mode, theme_colors, brand_palette, reminder_emails,
                        reminder_days, reminder_frequency, reminder_kinds, is_trial`;

/**
 * @param {string} id - users.id (UUID).
 * @returns {Promise<{id: string, email: string, display_name: string|null, avatar_url: string|null, language: string}|null>}
 */
const findUserById = async (id) => {
    const result = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1;`, [id]);
    return result.rows[0] ?? null;
};

/**
 * Looks a user up by email for login. Includes password_hash: only the auth controller uses this.
 * @param {string} email - Already lower-cased and trimmed.
 * @returns {Promise<Object|null>} The user row with password_hash, or null.
 */
const findUserForLogin = async (email) => {
    const result = await db.query(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1;`, [email]);
    return result.rows[0] ?? null;
};

/**
 * Returns only the password hash (for the change-password check).
 * @param {string} id
 * @returns {Promise<string|null>}
 */
const findPasswordHash = async (id) => {
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1;', [id]);
    return result.rows[0]?.password_hash ?? null;
};

/**
 * Creates a password account.
 * @param {{email: string, passwordHash: string, displayName: string, language: string, accountType?: 'couple'|'planner', businessName?: string|null}} values - Already validated.
 * @param {import('pg').PoolClient|typeof db} [client] - Pass a transaction client to join a transaction.
 * @returns {Promise<Object>} The new user (public columns).
 * @throws {Error} With code 23505 if the email is already registered.
 */
const createUser = async (
    { email, passwordHash, displayName, language, accountType = 'couple', businessName = null },
    client = db
) => {
    const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name, language, account_type, business_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${PUBLIC_COLUMNS};`,
        [email, passwordHash, displayName, language, accountType, businessName]
    );
    return result.rows[0];
};

/**
 * Finds or creates the account for a Google sign-in. An existing account with the same email
 * is linked rather than duplicated; callers must only pass an email Google has verified.
 * @param {{googleId: string, email: string, displayName: string|null, avatarUrl: string|null, language: string, accountType?: 'couple'|'planner'}} profile
 *        accountType only applies when a new account is created.
 * @param {import('pg').PoolClient|typeof db} [client]
 * @returns {Promise<{user: Object, created: boolean}>}
 */
const upsertGoogleUser = async (
    { googleId, email, displayName, avatarUrl, language, accountType = 'couple' },
    client = db
) => {
    const existing = await client.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE google_id = $1;`, [googleId]);
    if (existing.rows[0]) return { user: existing.rows[0], created: false };

    // Two separate steps: a single UPDATE matching "google_id OR email" could hit two rows.
    const linked = await client.query(
        `UPDATE users
         SET google_id = $1,
             avatar_url = COALESCE(avatar_url, $3),
             display_name = COALESCE(display_name, $4)
         WHERE email = $2 AND google_id IS NULL
         RETURNING ${PUBLIC_COLUMNS};`,
        [googleId, email, avatarUrl, displayName]
    );
    if (linked.rows[0]) return { user: linked.rows[0], created: false };

    const inserted = await client.query(
        `INSERT INTO users (email, google_id, display_name, avatar_url, language, account_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${PUBLIC_COLUMNS};`,
        [email, googleId, displayName, avatarUrl, language, accountType]
    );
    return { user: inserted.rows[0], created: true };
};

/**
 * Updates the profile fields a user can edit.
 * @param {string} id
 * @param {{displayName: string, language: string}} values - Already validated.
 * @returns {Promise<Object|null>} The updated user, or null if it no longer exists.
 */
const updateProfile = async (id, { displayName, language }) => {
    const result = await db.query(
        `UPDATE users SET display_name = $2, language = $3 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS};`,
        [id, displayName, language]
    );
    return result.rows[0] ?? null;
};

/**
 * Saves only the language preference (the language switcher).
 * @param {string} id
 * @param {string} language - A supported language code.
 * @returns {Promise<void>}
 */
const updateLanguage = async (id, language) => {
    await db.query('UPDATE users SET language = $2 WHERE id = $1;', [id, language]);
};

/**
 * @param {string} id
 * @param {string} passwordHash - From utils/password.js hashPassword.
 * @returns {Promise<void>}
 */
const updatePasswordHash = async (id, passwordHash) => {
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1;', [id, passwordHash]);
};

/**
 * Saves a user's own colour theme. Custom colours are kept when another palette is chosen, so
 * switching back to "custom" brings them back.
 * @param {string} id
 * @param {{palette: string, mode: string, colors: string|null}} values - Already validated; colors is a custom colours key or null to keep the saved one.
 * @returns {Promise<Object|null>} The updated user (public columns).
 */
const updateAppearance = async (id, { palette, mode, colors }) => {
    const result = await db.query(
        `UPDATE users SET theme_palette = $2, theme_mode = $3, theme_colors = COALESCE($4, theme_colors)
         WHERE id = $1 RETURNING ${PUBLIC_COLUMNS};`,
        [id, palette, mode, colors ?? null]
    );
    return result.rows[0] ?? null;
};

/**
 * Saves a planner's business name and brand palette (null = clients see their own palette).
 * Only planner accounts are updated.
 * @param {string} id
 * @param {{businessName: string|null, brandPalette: string|null}} values - Already validated.
 * @returns {Promise<Object|null>} The updated user, or null when the account is not a planner.
 */
const updateBusiness = async (id, { businessName, brandPalette }) => {
    const result = await db.query(
        `UPDATE users SET business_name = $2, brand_palette = $3
         WHERE id = $1 AND account_type = 'planner'
         RETURNING ${PUBLIC_COLUMNS};`,
        [id, businessName, brandPalette]
    );
    return result.rows[0] ?? null;
};

/**
 * Turns a couple account into a planner account. Existing weddings are untouched (a wedding only
 * becomes a planner wedding when a planner creates or takes it over). No founding number is given
 * here: that happens with the planner's first planner wedding.
 * @param {string} id
 * @param {import('pg').PoolClient|typeof db} [client]
 * @returns {Promise<Object|null>} The updated user, or null when it does not exist.
 */
const upgradeToPlanner = async (id, client = db) => {
    const result = await client.query(
        `UPDATE users SET account_type = 'planner' WHERE id = $1 RETURNING ${PUBLIC_COLUMNS};`,
        [id]
    );
    return result.rows[0] ?? null;
};

/**
 * Switches the daily reminder email on or off.
 * @param {string} id
 * @param {boolean} on
 * @returns {Promise<object|null>} The updated public row, or null if there is no such user.
 */
const setReminderEmails = async (id, on) => {
    const result = await db.query(`UPDATE users SET reminder_emails = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS};`, [
        id,
        on
    ]);
    return result.rows[0] ?? null;
};

/**
 * Saves the reminder choices: on or off, days ahead, daily or weekly, and which kinds.
 * @param {string} id
 * @param {{on: boolean, days: number, frequency: string, kinds: string[]}} prefs - Already validated.
 * @returns {Promise<object|null>} The updated public row, or null if there is no such user.
 */
const setReminderPreferences = async (id, { on, days, frequency, kinds }) => {
    const result = await db.query(
        `UPDATE users SET reminder_emails = $2, reminder_days = $3, reminder_frequency = $4, reminder_kinds = $5
         WHERE id = $1 RETURNING ${PUBLIC_COLUMNS};`,
        [id, on, days, frequency, kinds]
    );
    return result.rows[0] ?? null;
};

export {
    setReminderEmails,
    setReminderPreferences,
    upgradeToPlanner,
    updateAppearance,
    updateBusiness,
    findUserById,
    findUserForLogin,
    findPasswordHash,
    createUser,
    upsertGoogleUser,
    updateProfile,
    updateLanguage,
    updatePasswordHash
};
