import { COUNTED_STATUS } from '../constants.js';
import db from './db.js';

// Every query below starts from the person's memberships, so another wedding never appears.
const MY_WEDDINGS = `SELECT w.id, w.name, w.wedding_date
                     FROM weddings w JOIN wedding_members wm ON wm.wedding_id = w.id
                     WHERE wm.user_id = $1 AND ($4::uuid IS NULL OR w.id = $4)`;
// The calendar leaves archived weddings out unless one is picked; search still finds them.
const ACTIVE = `AND (w.archived_at IS NULL OR w.id = $4)`;

/**
 * Everything dated between two days (inclusive) across the person's weddings: wedding days, open
 * tasks, unpaid payments of booked vendors (the Payments due rule), open decisions and appointments.
 * @param {string} userId
 * @param {string} from - YYYY-MM-DD.
 * @param {string} to - YYYY-MM-DD.
 * @param {string|null} [weddingId] - Only this wedding (ignored unless the person belongs to it).
 * @returns {Promise<Array<{kind: 'wedding'|'task'|'payment'|'decision'|'appointment', day: string, title: string, wedding_id: string, wedding_name: string, amount: string|null, time: string|null}>>}
 */
const findCalendarEntries = async (userId, from, to, weddingId = null) => {
    const result = await db.query(
        `WITH mine AS (${MY_WEDDINGS} ${ACTIVE})
         SELECT 'wedding' AS kind, to_char(m.wedding_date, 'YYYY-MM-DD') AS day, m.name AS title,
                m.id AS wedding_id, m.name AS wedding_name, NULL::numeric AS amount, 0 AS ord,
                NULL::text AS time
         FROM mine m WHERE m.wedding_date BETWEEN $2 AND $3
         UNION ALL
         SELECT 'task', to_char(t.due_date, 'YYYY-MM-DD'), t.text, m.id, m.name, NULL, 1, NULL
         FROM checklist_tasks t JOIN mine m ON m.id = t.wedding_id
         WHERE NOT t.done AND t.due_date BETWEEN $2 AND $3
         UNION ALL
         SELECT 'payment', to_char(p.due_date, 'YYYY-MM-DD'), v.name || ': ' || p.label, m.id, m.name, p.amount, 2, NULL
         FROM vendor_payments p
         JOIN vendors v ON v.id = p.vendor_id AND v.wedding_id = p.wedding_id
         JOIN mine m ON m.id = p.wedding_id
         WHERE p.paid_on IS NULL AND v.status = $5 AND p.due_date BETWEEN $2 AND $3
         UNION ALL
         SELECT 'decision', to_char(d.due_date, 'YYYY-MM-DD'), d.title, m.id, m.name, NULL, 3, NULL
         FROM decisions d JOIN mine m ON m.id = d.wedding_id
         WHERE d.status = 'open' AND d.due_date BETWEEN $2 AND $3
         UNION ALL
         SELECT 'appointment', to_char(a.starts_on, 'YYYY-MM-DD'), a.title, m.id, m.name, NULL, 4, to_char(a.starts_at, 'HH24:MI')
         FROM appointments a JOIN mine m ON m.id = a.wedding_id
         WHERE a.starts_on BETWEEN $2 AND $3
         ORDER BY day, ord, time NULLS LAST, wedding_name, title;`,
        [userId, from, to, weddingId, COUNTED_STATUS]
    );
    return result.rows.map(({ ord: _ord, ...row }) => row);
};

/** Escapes LIKE wildcards so a search for "100%" matches the text "100%". */
const likePattern = (query) => `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Case-insensitive "contains" search over the person's weddings.
 * @param {string} userId
 * @param {string} query - Already trimmed and long enough.
 * @param {number} limit - Results per kind.
 * @returns {Promise<Array<{kind: 'guest'|'vendor'|'task'|'decision'|'schedule'|'appointment', id: string, title: string, wedding_id: string, wedding_name: string}>>}
 */
const searchWeddings = async (userId, query, limit) => {
    const kinds = [
        ['guest', 'guests', 'name'],
        ['vendor', 'vendors', 'name'],
        ['task', 'checklist_tasks', 'text'],
        ['decision', 'decisions', 'title'],
        ['schedule', 'schedule_items', 'title'],
        ['appointment', 'appointments', 'title']
    ];
    // Table and column names come from the fixed list above, never from input.
    const parts = kinds.map(
        ([
            kind,
            table,
            column
        ]) => `(SELECT '${kind}' AS kind, x.id, x.${column} AS title, m.id AS wedding_id, m.name AS wedding_name
          FROM ${table} x JOIN mine m ON m.id = x.wedding_id
          WHERE x.${column} ILIKE $2 ESCAPE '\\'
          ORDER BY m.name, x.${column}
          LIMIT $3)`
    );
    const result = await db.query(`WITH mine AS (${MY_WEDDINGS}) ${parts.join(' UNION ALL ')};`, [
        userId,
        likePattern(query),
        limit,
        null
    ]);
    return result.rows;
};

export { findCalendarEntries, searchWeddings };
