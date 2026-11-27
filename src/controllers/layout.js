import { LAYOUT_FIXTURES, LAYOUT_SHAPES, LAYOUT_UNITS, MAX_LAYOUT_ITEMS } from '../constants.js';
import {
    addLayoutItem,
    countLayoutItems,
    deleteLayoutItem,
    findLayoutItem,
    findLayoutItems,
    findRoom,
    findTableForLayout,
    findUnplacedTables,
    moveLayoutItem,
    saveRoom,
    updateLayoutItem
} from '../models/layout.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';
import {
    clampToRoom,
    convertPiece,
    findFreeSpot,
    fixtureDefaults,
    readMove,
    tableDefaults,
    validateNewFixture,
    validatePiece,
    validateRoom
} from '../validators/layout.js';

// Grid squares on the plan: 5 ft or 1 m.
const GRID = Object.freeze({ ft: 5, m: 1 });

const renderLayout = async (req, res, { status = 200, roomForm, fixtureForm, pieceForm } = {}) => {
    const [room, items, unplaced] = await Promise.all([
        findRoom(req.wedding.id),
        findLayoutItems(req.wedding.id),
        findUnplacedTables(req.wedding.id)
    ]);
    res.status(status).render('layout', {
        title: req.t('layout.title'),
        room,
        items,
        unplaced,
        grid: GRID[room.unit],
        fixtures: Object.keys(LAYOUT_FIXTURES),
        shapes: LAYOUT_SHAPES,
        units: LAYOUT_UNITS,
        maxItems: MAX_LAYOUT_ITEMS,
        roomForm: roomForm ?? { values: { width: room.width, depth: room.depth, unit: room.unit }, errors: [] },
        fixtureForm: fixtureForm ?? { values: { kind: 'dance_floor', label: '' }, errors: [] },
        pieceForm: pieceForm ?? null
    });
};

/** GET /layout: the venue floor plan. */
const showLayout = (req, res) => renderLayout(req, res);

/** POST /layout/room: the room's size and unit. A new unit converts the pieces; any that no longer fit move back inside. */
const processRoom = async (req, res) => {
    const { values, data, errors } = validateRoom(req.body);
    if (errors.length > 0) return renderLayout(req, res, { status: 400, roomForm: { values, errors } });
    const previous = await findRoom(req.wedding.id);
    await saveRoom(req.wedding.id, data);
    // A new unit converts every piece (a 5 ft table stays about 1.5 m); then anything that no longer
    // fits is moved back inside.
    for (const item of await findLayoutItems(req.wedding.id)) {
        const converted = { ...item, ...convertPiece(item, previous.unit, data.unit) };
        const piece = { ...converted, ...clampToRoom(converted, data) };
        const changed = ['x', 'y', 'width', 'depth'].some((key) => piece[key] !== item[key]);
        if (changed) await updateLayoutItem(item.id, req.wedding.id, piece);
    }
    setFlash(req, 'success', 'layout.roomSaved');
    res.redirect('/layout');
};

const limitReached = async (req) => {
    if ((await countLayoutItems(req.wedding.id)) < MAX_LAYOUT_ITEMS) return false;
    setFlash(req, 'error', 'layout.limit', { max: MAX_LAYOUT_ITEMS });
    return true;
};

/** POST /layout/items: adds a fixture (dance floor, bar…) in the free space nearest the middle. */
const processNewFixture = async (req, res) => {
    const { values, data, errors } = validateNewFixture(req.body);
    if (errors.length > 0) return renderLayout(req, res, { status: 400, fixtureForm: { values, errors } });
    if (await limitReached(req)) return res.redirect('/layout');
    const [room, others] = await Promise.all([findRoom(req.wedding.id), findLayoutItems(req.wedding.id)]);
    const piece = { ...fixtureDefaults(data.kind, room.unit), rotation: 0 };
    await addLayoutItem(req.wedding.id, {
        ...piece,
        ...findFreeSpot(piece, room, others),
        kind: data.kind,
        label: data.label,
        tableId: null
    });
    setFlash(req, 'success', 'layout.added', { name: data.label || req.t(`layoutKind.${data.kind}`) });
    res.redirect('/layout');
};

/** POST /layout/tables: puts a seating table on the plan. */
const processPlaceTable = async (req, res, next) => {
    const table = isUuid(req.body?.table_id) ? await findTableForLayout(req.body.table_id, req.wedding.id) : null;
    if (!table) return next();
    if (!table.placed) {
        if (await limitReached(req)) return res.redirect('/layout');
        const [room, others] = await Promise.all([findRoom(req.wedding.id), findLayoutItems(req.wedding.id)]);
        const piece = { ...tableDefaults(table.seats, room.unit), rotation: 0 };
        await addLayoutItem(req.wedding.id, {
            ...piece,
            ...findFreeSpot(piece, room, others),
            kind: 'table',
            label: null,
            tableId: table.id
        });
        setFlash(req, 'success', 'layout.added', { name: table.name });
    }
    res.redirect('/layout');
};

const loadItem = async (req) => (isUuid(req.params.id) ? findLayoutItem(req.params.id, req.wedding.id) : null);

/** POST /layout/items/:id: edits a piece (the form under each piece in the list). */
const processEditPiece = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item) return next();
    const room = await findRoom(req.wedding.id);
    const { values, data, errors } = validatePiece(req.body, room);
    if (errors.length > 0) return renderLayout(req, res, { status: 400, pieceForm: { id: item.id, values, errors } });
    await updateLayoutItem(item.id, req.wedding.id, data);
    setFlash(req, 'success', 'layout.pieceSaved');
    res.redirect('/layout');
};

/**
 * POST /layout/items/:id/move: drag and drop (fetch, answered with JSON) or a plain form.
 */
const processMovePiece = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item) return next();
    const wantsJson = req.accepts(['html', 'json']) === 'json';
    const position = readMove(req.body, item, await findRoom(req.wedding.id));
    if (!position) {
        if (wantsJson) return res.status(400).json({ error: req.t('layout.position') });
        setFlash(req, 'error', 'layout.position');
        return res.redirect('/layout');
    }
    await moveLayoutItem(item.id, req.wedding.id, position);
    if (wantsJson) return res.json(position);
    res.redirect('/layout');
};

/** POST /layout/items/:id/delete */
const processDeletePiece = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteLayoutItem(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'layout.deleted');
    res.redirect('/layout');
};

export {
    showLayout,
    processRoom,
    processNewFixture,
    processPlaceTable,
    processEditPiece,
    processMovePiece,
    processDeletePiece
};
