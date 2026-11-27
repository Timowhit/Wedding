import { PG_ERRORS } from '../models/db.js';
import {
    assignGuestToTable,
    createTable,
    deleteTable,
    findGuestGroups,
    findTablesWithGuests,
    findUnseatedGuests,
    updateTable
} from '../models/seating.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readText } from '../validators/common.js';
import { validateTable } from '../validators/seating.js';

const EMPTY_TABLE = { name: '', seats: '8' };
const DUPLICATE_ERROR = { field: 'name', key: 'seating.duplicate' };
const GROUP_MAX = 80;

const renderSeating = async (req, res, { status = 200, tableForm } = {}) => {
    const weddingId = req.wedding.id;
    const group = readText(req.query.group).slice(0, GROUP_MAX) || null;
    const [tables, unseated, groups] = await Promise.all([
        findTablesWithGuests(weddingId),
        findUnseatedGuests(weddingId, group),
        findGuestGroups(weddingId)
    ]);
    res.status(status).render('seating', {
        title: req.t('seating.title'),
        tables,
        unseated,
        groups,
        activeGroup: group,
        tableForm: tableForm ?? { values: EMPTY_TABLE, errors: [] }
    });
};

const showSeating = (req, res) => renderSeating(req, res);

const processNewTable = async (req, res) => {
    const { values, data, errors } = validateTable(req.body);
    if (errors.length === 0) {
        try {
            const table = await createTable(req.wedding.id, data);
            setFlash(req, 'success', 'seating.tableAdded', { name: table.name });
            return res.redirect('/seating');
        } catch (err) {
            if (err.code !== PG_ERRORS.UNIQUE_VIOLATION) throw err;
            errors.push(DUPLICATE_ERROR);
        }
    }
    renderSeating(req, res, { status: 400, tableForm: { values, errors } });
};

/** Rename or resize a table (the small form on each table card). */
const processEditTable = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { data, errors } = validateTable(req.body);
    if (errors.length > 0) {
        setFlash(req, 'error', errors[0].key, errors[0].vars);
        return res.redirect('/seating');
    }
    try {
        const updated = await updateTable(req.params.id, req.wedding.id, data);
        if (!updated) return next();
        setFlash(req, 'success', 'seating.tableSaved', { name: updated.name });
    } catch (err) {
        if (err.code !== PG_ERRORS.UNIQUE_VIOLATION) throw err;
        setFlash(req, 'error', DUPLICATE_ERROR.key);
    }
    res.redirect('/seating');
};

const processDeleteTable = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteTable(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'seating.tableRemoved');
    res.redirect('/seating');
};

/** The table picker on each guest (also used by drag and drop). An empty value unseats. */
const processAssignGuest = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const raw = readText(req.body?.table_id);
    if (raw !== '' && !isUuid(raw)) {
        setFlash(req, 'error', 'seating.tableMissing');
        return res.redirect('/seating');
    }
    const outcome = await assignGuestToTable(req.params.id, req.wedding.id, raw === '' ? null : raw);
    if (outcome === 'no-guest') return next();
    const messages = {
        seated: ['success', 'seating.seated'],
        unseated: ['success', 'seating.unseatedSaved'],
        'no-table': ['error', 'seating.tableMissing'],
        declined: ['error', 'seating.declinedGuest']
    };
    const [type, key] = messages[outcome];
    setFlash(req, type, key);
    res.redirect(backTo(req, '/seating'));
};

export { showSeating, processNewTable, processEditTable, processDeleteTable, processAssignGuest };
