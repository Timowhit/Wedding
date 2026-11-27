import db, { withTransaction } from './db.js';

/** Roles a member can have. Must match the CHECK constraint on wedding_members.role. */
const MEMBER_ROLES = Object.freeze(['owner', 'editor', 'client', 'viewer']);
/** Roles an owner may give someone else in a couple's own wedding (there is exactly one owner). */
const ASSIGNABLE_ROLES = Object.freeze(['editor', 'viewer']);
/** In a planner wedding the couple join as clients and assistants as editors. */
const PLANNER_ASSIGNABLE_ROLES = Object.freeze(['client', 'editor', 'viewer']);

/**
 * Roles the owner may give others in this wedding. Couples' own weddings never offer `client`,
 * so couples never meet planner wording.
 * @param {{planner_managed?: boolean}} wedding
 * @returns {readonly string[]}
 */
const assignableRoles = (wedding) => (wedding?.planner_managed ? PLANNER_ASSIGNABLE_ROLES : ASSIGNABLE_ROLES);

// The owner's brand palette, applied inside weddings a planner owns (see src/themes.js).
const OWNER_BRAND_PALETTE = `(SELECT ou.brand_palette
                              FROM wedding_members om
                              JOIN users ou ON ou.id = om.user_id
                              WHERE om.wedding_id = w.id AND om.role = 'owner' AND ou.account_type = 'planner')`;
const DEFAULT_WEDDING_NAME = 'Our Wedding';

/**
 * Every wedding the user belongs to, owned weddings first, then by join date.
 * @param {string} userId
 * @returns {Promise<Array<{id: string, name: string, wedding_date: Date|null, planner_managed: boolean, theme_colors: string|null, role: string, owner_brand_palette: string|null}>>}
 */
const findWeddingsForUser = async (userId) => {
    const result = await db.query(
        `SELECT w.id, w.name, w.wedding_date, w.planner_managed, w.theme_colors, wm.role,
                ${OWNER_BRAND_PALETTE} AS owner_brand_palette
         FROM weddings w
         JOIN wedding_members wm ON wm.wedding_id = w.id
         WHERE wm.user_id = $1
         ORDER BY (wm.role = 'owner') DESC, wm.joined_at ASC, w.id ASC;`,
        [userId]
    );
    return result.rows;
};

/**
 * One wedding with the user's role in it, or null if the user is not a member.
 * This is the access check every wedding page relies on.
 * @param {string} weddingId
 * @param {string} userId
 * @returns {Promise<{id: string, name: string, wedding_date: Date|null, planner_managed: boolean, theme_colors: string|null, role: string, owner_brand_palette: string|null}|null>}
 */
const findWeddingForMember = async (weddingId, userId) => {
    const result = await db.query(
        `SELECT w.id, w.name, w.wedding_date, w.planner_managed, w.theme_colors, wm.role,
                ${OWNER_BRAND_PALETTE} AS owner_brand_palette
         FROM weddings w
         JOIN wedding_members wm ON wm.wedding_id = w.id
         WHERE w.id = $1 AND wm.user_id = $2;`,
        [weddingId, userId]
    );
    return result.rows[0] ?? null;
};

/**
 * Creates a wedding and makes the creator its owner, atomically.
 * @param {string} userId
 * @param {{name?: string, weddingDate?: string|null}} values - Already validated.
 * @param {import('pg').PoolClient} [client] - Join an existing transaction instead of starting one.
 * @returns {Promise<{id: string, name: string, wedding_date: Date|null, role: 'owner'}>}
 */
const createWedding = async (userId, { name, weddingDate = null }, client) => {
    const insert = async (tx) => {
        const created = await tx.query(
            `INSERT INTO weddings (name, wedding_date, created_by)
             VALUES ($1, $2, $3)
             RETURNING id, name, wedding_date;`,
            [name || DEFAULT_WEDDING_NAME, weddingDate, userId]
        );
        const wedding = created.rows[0];
        await tx.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'owner');`, [
            wedding.id,
            userId
        ]);
        return { ...wedding, role: 'owner' };
    };
    return client ? insert(client) : withTransaction(insert);
};

/**
 * @param {string} id
 * @param {{name: string, weddingDate: string|null}} values - Already validated; null clears the date.
 * @returns {Promise<Object|null>} The updated wedding, or null if it no longer exists.
 */
const updateWedding = async (id, { name, weddingDate }) => {
    const result = await db.query(
        `UPDATE weddings SET name = $2, wedding_date = $3 WHERE id = $1 RETURNING id, name, wedding_date;`,
        [id, name, weddingDate]
    );
    return result.rows[0] ?? null;
};

/**
 * Saves only the wedding date (the dashboard's date form).
 * @param {string} id
 * @param {string|null} weddingDate
 * @returns {Promise<void>}
 */
const updateWeddingDate = async (id, weddingDate) => {
    await db.query('UPDATE weddings SET wedding_date = $2 WHERE id = $1;', [id, weddingDate]);
};

/**
 * Everyone in a wedding, owner first.
 * @param {string} weddingId
 * @returns {Promise<Array<{user_id: string, email: string, display_name: string|null, avatar_url: string|null, role: string, joined_at: Date}>>}
 */
const findMembers = async (weddingId) => {
    const result = await db.query(
        `SELECT u.id AS user_id, u.email, u.display_name, u.avatar_url, wm.role, wm.joined_at
         FROM wedding_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.wedding_id = $1
         ORDER BY (wm.role = 'owner') DESC, wm.joined_at ASC;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * @param {string} weddingId
 * @returns {Promise<number>} How many people (owner included) belong to the wedding.
 */
const countMembers = async (weddingId) => {
    const result = await db.query('SELECT COUNT(*) AS total FROM wedding_members WHERE wedding_id = $1;', [weddingId]);
    return Number(result.rows[0].total);
};

/**
 * Adds a member. An existing membership is left untouched (accepting an invite never
 * changes, and in particular never downgrades, a role the user already has).
 * @param {string} weddingId
 * @param {string} userId
 * @param {'editor'|'client'|'viewer'} role
 * @param {import('pg').PoolClient|typeof db} [client]
 * @returns {Promise<boolean>} True when a new membership was created.
 */
const addMember = async (weddingId, userId, role, client = db) => {
    const result = await client.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (wedding_id, user_id) DO NOTHING;`,
        [weddingId, userId, role]
    );
    return result.rowCount > 0;
};

/**
 * Changes a non-owner member's role. The owner row can never be changed here.
 * @param {string} weddingId
 * @param {string} userId
 * @param {'editor'|'client'|'viewer'} role
 * @returns {Promise<boolean>} False when there is no such non-owner member.
 */
const updateMemberRole = async (weddingId, userId, role) => {
    const result = await db.query(
        `UPDATE wedding_members SET role = $3
         WHERE wedding_id = $1 AND user_id = $2 AND role <> 'owner';`,
        [weddingId, userId, role]
    );
    return result.rowCount > 0;
};

/**
 * Removes a non-owner member (used both by the owner and by a member leaving).
 * @param {string} weddingId
 * @param {string} userId
 * @returns {Promise<boolean>} False when there is no such non-owner member.
 */
const removeMember = async (weddingId, userId) => {
    const result = await db.query(
        `DELETE FROM wedding_members WHERE wedding_id = $1 AND user_id = $2 AND role <> 'owner';`,
        [weddingId, userId]
    );
    return result.rowCount > 0;
};

export {
    MEMBER_ROLES,
    ASSIGNABLE_ROLES,
    assignableRoles,
    DEFAULT_WEDDING_NAME,
    findWeddingsForUser,
    findWeddingForMember,
    createWedding,
    updateWedding,
    updateWeddingDate,
    findMembers,
    countMembers,
    addMember,
    updateMemberRole,
    removeMember
};
