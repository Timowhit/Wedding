import { LAYOUT_FIXTURES, LAYOUT_SHAPES, LAYOUT_UNITS, MAX_LAYOUT_ITEMS, MAX_ROOMS } from '../constants.js';
import {
    addLayoutItem,
    addRoom,
    countLayoutItems,
    deleteLayoutItem,
    deleteRoom,
    findLayoutItem,
    findLayoutItems,
    findRoom,
    findRooms,
    findTableForLayout,
    findUnplacedTables,
    moveLayoutItem,
    saveRoom,
    setItemRoom,
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
// Pieces in the inventory belong to no room, so their sizes are kept in feet.
const INVENTORY_UNIT = 'ft';

/** Where a room is shown: the first room at /layout, the others at /layout?room=<id>. */
const roomUrl = (room, rooms) => (room.id === rooms[0].id ? '/layout' : `/layout?room=${room.id}`);

/** A room's name as shown: its own, or "Main room" / "Room 2"… when it has none. */
const roomLabel = (req, rooms) => (room) => {
    if (room.name) return room.name;
    const index = rooms.findIndex((other) => other.id === room.id);
    return index === 0 ? req.t('layout.mainRoom') : req.t('layout.roomN', { n: index + 1 });
};

/**
 * The room a request is about: ?room= on pages, room_id in forms, else the first room. Null when
 * an id is given that isn't one of this wedding's rooms.
 */
const pickRoom = (rooms, id) => {
    if (id === undefined || id === '') return rooms[0];
    return rooms.find((room) => room.id === id) ?? null;
};

const renderLayout = async (req, res, room, rooms, { status = 200, roomForm, newRoomForm, fixtureForm, pieceForm } = {}) => {
    const [items, inventory, unplaced] = await Promise.all([
        findLayoutItems(req.wedding.id, room.id),
        findLayoutItems(req.wedding.id, null),
        findUnplacedTables(req.wedding.id)
    ]);
    const label = roomLabel(req, rooms);
    res.status(status).render('layout', {
        title: req.t('layout.title'),
        room: { ...room, label: label(room) },
        rooms: rooms.map((other) => ({ ...other, label: label(other), url: roomUrl(other, rooms) })),
        items,
        inventory,
        unplaced,
        grid: GRID[room.unit],
        fixtures: Object.keys(LAYOUT_FIXTURES),
        shapes: LAYOUT_SHAPES,
        units: LAYOUT_UNITS,
        maxItems: MAX_LAYOUT_ITEMS,
        maxRooms: MAX_ROOMS,
        roomForm: roomForm ?? {
            values: { name: room.name ?? '', width: room.width, depth: room.depth, unit: room.unit },
            errors: []
        },
        newRoomForm: newRoomForm ?? { values: { name: '', width: '', depth: '', unit: room.unit }, errors: [] },
        fixtureForm: fixtureForm ?? { values: { kind: 'dance_floor', label: '' }, errors: [] },
        pieceForm: pieceForm ?? null
    });
};

/** GET /layout (?room=<id>): one room's floor plan, the other rooms, and the inventory. */
const showLayout = async (req, res, next) => {
    const rooms = await findRooms(req.wedding.id);
    const room = pickRoom(rooms, req.query.room);
    if (!room) return next();
    return renderLayout(req, res, room, rooms);
};

/** The room named by the form's room_id (or the first room), with the wedding's rooms. */
const formRoom = async (req) => {
    const rooms = await findRooms(req.wedding.id);
    return { rooms, room: pickRoom(rooms, req.body?.room_id) };
};

/**
 * POST /layout/room: a room's name, size and unit. A new unit converts the room's pieces; any
 * that no longer fit move back inside.
 */
const processRoom = async (req, res, next) => {
    const { rooms, room } = await formRoom(req);
    if (!room) return next();
    const { values, data, errors } = validateRoom(req.body);
    if (errors.length > 0) return renderLayout(req, res, room, rooms, { status: 400, roomForm: { values, errors } });
    await saveRoom(room.id, req.wedding.id, data);
    // A new unit converts every piece (a 5 ft table stays about 1.5 m); then anything that no longer
    // fits is moved back inside.
    for (const item of await findLayoutItems(req.wedding.id, room.id)) {
        const converted = { ...item, ...convertPiece(item, room.unit, data.unit) };
        const piece = { ...converted, ...clampToRoom(converted, data) };
        const changed = ['x', 'y', 'width', 'depth'].some((key) => piece[key] !== item[key]);
        if (changed) await updateLayoutItem(item.id, req.wedding.id, piece);
    }
    setFlash(req, 'success', 'layout.roomSaved');
    res.redirect(roomUrl(room, rooms));
};

/** POST /layout/rooms: adds a room (or floor) and shows it. */
const processNewRoom = async (req, res) => {
    const rooms = await findRooms(req.wedding.id);
    const current = pickRoom(rooms, req.body?.room_id) ?? rooms[0];
    const { values, data, errors } = validateRoom(req.body);
    if (errors.length > 0)
        return renderLayout(req, res, current, rooms, { status: 400, newRoomForm: { values, errors } });
    const added = await addRoom(req.wedding.id, data);
    if (!added) {
        setFlash(req, 'error', 'layout.roomLimit', { max: MAX_ROOMS });
        return res.redirect(roomUrl(current, rooms));
    }
    setFlash(req, 'success', 'layout.roomAdded', { name: data.name || req.t('layout.roomN', { n: rooms.length + 1 }) });
    res.redirect(`/layout?room=${added.id}`);
};

/** POST /layout/rooms/:id/delete: its pieces go to the inventory; the last room stays. */
const processDeleteRoom = async (req, res, next) => {
    const room = isUuid(req.params.id) ? await findRoom(req.params.id, req.wedding.id) : null;
    if (!room) return next();
    if (await deleteRoom(room.id, req.wedding.id)) setFlash(req, 'success', 'layout.roomDeleted');
    else setFlash(req, 'error', 'layout.lastRoom');
    res.redirect('/layout');
};

const limitReached = async (req) => {
    if ((await countLayoutItems(req.wedding.id)) < MAX_LAYOUT_ITEMS) return false;
    setFlash(req, 'error', 'layout.limit', { max: MAX_LAYOUT_ITEMS });
    return true;
};

/** A piece's place and size in a room: converted to its unit, in the free space nearest the middle. */
const placeIn = async (req, room, piece, fromUnit) => {
    const sized = { ...piece, ...convertPiece(piece, fromUnit, room.unit) };
    const others = await findLayoutItems(req.wedding.id, room.id);
    return { ...sized, ...findFreeSpot(sized, room, others) };
};

/**
 * POST /layout/items: adds a fixture (dance floor, bar…) to the room, in the free space nearest
 * the middle, or (where=inventory) to the inventory to place later.
 */
const processNewFixture = async (req, res, next) => {
    const { rooms, room } = await formRoom(req);
    if (!room) return next();
    const { values, data, errors } = validateNewFixture(req.body);
    if (errors.length > 0) return renderLayout(req, res, room, rooms, { status: 400, fixtureForm: { values, errors } });
    if (await limitReached(req)) return res.redirect(roomUrl(room, rooms));
    const toInventory = req.body.where === 'inventory';
    // Each unit has its own round default sizes.
    const unit = toInventory ? INVENTORY_UNIT : room.unit;
    const piece = { ...fixtureDefaults(data.kind, unit), rotation: 0, x: 0, y: 0 };
    const placed = toInventory ? piece : await placeIn(req, room, piece, unit);
    const added = await addLayoutItem(req.wedding.id, {
        ...placed,
        roomId: toInventory ? null : room.id,
        kind: data.kind,
        label: data.label,
        tableId: null
    });
    // Null only when another request filled the last space a moment earlier.
    const name = data.label || req.t(`layoutKind.${data.kind}`);
    if (added) setFlash(req, 'success', toInventory ? 'layout.addedToInventory' : 'layout.added', { name });
    else setFlash(req, 'error', 'layout.limit', { max: MAX_LAYOUT_ITEMS });
    res.redirect(roomUrl(room, rooms));
};

/** Puts one seating table in a room. Returns false when the plan is full or it is placed already. */
const placeTable = async (req, room, table) => {
    const piece = { ...tableDefaults(table.seats, room.unit), rotation: 0 };
    const others = await findLayoutItems(req.wedding.id, room.id);
    const added = await addLayoutItem(req.wedding.id, {
        ...piece,
        ...findFreeSpot(piece, room, others),
        roomId: room.id,
        kind: 'table',
        label: null,
        tableId: table.id
    });
    return Boolean(added);
};

/** POST /layout/tables: puts a seating table on the room's plan. */
const processPlaceTable = async (req, res, next) => {
    const { rooms, room } = await formRoom(req);
    const table = isUuid(req.body?.table_id) ? await findTableForLayout(req.body.table_id, req.wedding.id) : null;
    if (!room || !table) return next();
    if (!table.placed) {
        if (await limitReached(req)) return res.redirect(roomUrl(room, rooms));
        // False when the plan filled up, or the same table was placed a moment earlier.
        if (await placeTable(req, room, table)) setFlash(req, 'success', 'layout.added', { name: table.name });
    }
    res.redirect(roomUrl(room, rooms));
};

/** POST /layout/tables/all: puts every seating table that isn't on a plan yet into the room. */
const processPlaceAllTables = async (req, res, next) => {
    const { rooms, room } = await formRoom(req);
    if (!room) return next();
    let count = 0;
    for (const table of await findUnplacedTables(req.wedding.id)) {
        if (!(await placeTable(req, room, table))) break;
        count += 1;
    }
    if (count > 0) setFlash(req, 'success', 'layout.tablesPlaced', { count });
    else if (await limitReached(req)) return res.redirect(roomUrl(room, rooms));
    res.redirect(roomUrl(room, rooms));
};

const loadItem = async (req) => (isUuid(req.params.id) ? findLayoutItem(req.params.id, req.wedding.id) : null);

/** POST /layout/items/:id: edits a piece on a plan (the form under each piece in the list). */
const processEditPiece = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item || !item.room_id) return next();
    const rooms = await findRooms(req.wedding.id);
    const room = rooms.find((other) => other.id === item.room_id);
    const { values, data, errors } = validatePiece(req.body, room);
    if (errors.length > 0)
        return renderLayout(req, res, room, rooms, { status: 400, pieceForm: { id: item.id, values, errors } });
    await updateLayoutItem(item.id, req.wedding.id, data);
    setFlash(req, 'success', 'layout.pieceSaved');
    res.redirect(roomUrl(room, rooms));
};

/**
 * POST /layout/items/:id/room: moves a piece to another room (converted to its unit, in its free
 * space) or, with an empty room_id, to the inventory.
 */
const processPieceRoom = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item) return next();
    const rooms = await findRooms(req.wedding.id);
    const from = rooms.find((room) => room.id === item.room_id) ?? null;
    const fromUnit = from ? from.unit : INVENTORY_UNIT;
    const targetId = typeof req.body?.room_id === 'string' ? req.body.room_id : '';
    if (targetId === '') {
        await setItemRoom(item.id, req.wedding.id, null, { ...convertPiece(item, fromUnit, INVENTORY_UNIT), x: 0, y: 0 });
        setFlash(req, 'success', 'layout.movedToInventory');
        return res.redirect(from ? roomUrl(from, rooms) : '/layout');
    }
    const target = rooms.find((room) => room.id === targetId);
    if (!target) return next();
    if (target.id !== item.room_id) {
        const placed = await placeIn(req, target, item, fromUnit);
        await setItemRoom(item.id, req.wedding.id, target.id, placed);
        setFlash(req, 'success', 'layout.placed', { room: roomLabel(req, rooms)(target) });
    }
    res.redirect(roomUrl(target, rooms));
};

/**
 * POST /layout/items/:id/move: drag and drop (fetch, answered with JSON) or a plain form.
 */
const processMovePiece = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item) return next();
    const wantsJson = req.accepts(['html', 'json']) === 'json';
    const room = item.room_id ? await findRoom(item.room_id, req.wedding.id) : null;
    const position = room ? readMove(req.body, item, room) : null;
    if (!position) {
        if (wantsJson) return res.status(400).json({ error: req.t('layout.position') });
        setFlash(req, 'error', 'layout.position');
        return res.redirect(room ? `/layout?room=${room.id}` : '/layout');
    }
    await moveLayoutItem(item.id, req.wedding.id, position);
    if (wantsJson) return res.json(position);
    const rooms = await findRooms(req.wedding.id);
    res.redirect(roomUrl(room, rooms));
};

/** POST /layout/items/:id/delete */
const processDeletePiece = async (req, res, next) => {
    const item = await loadItem(req);
    if (!item || !(await deleteLayoutItem(item.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'layout.deleted');
    const rooms = await findRooms(req.wedding.id);
    const room = rooms.find((other) => other.id === item.room_id);
    res.redirect(room ? roomUrl(room, rooms) : '/layout');
};

export {
    showLayout,
    processRoom,
    processNewRoom,
    processDeleteRoom,
    processNewFixture,
    processPlaceTable,
    processPlaceAllTables,
    processEditPiece,
    processPieceRoom,
    processMovePiece,
    processDeletePiece
};
