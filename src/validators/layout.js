import {
    LAYOUT_FIXTURES,
    LAYOUT_LABEL_MAX,
    LAYOUT_SHAPES,
    LAYOUT_UNITS,
    PIECE_SIZE_MAX,
    PIECE_SIZE_MIN,
    ROOM_NAME_MAX,
    ROOM_SIZE_MAX,
    ROOM_SIZE_MIN
} from '../constants.js';
import { checkText, collectErrors, readChoice, readText } from './common.js';

const FEET_PER_METRE = 3.281;
const DEGREES_MAX = 359;
const NUMBER = /^-?\d{1,4}(\.\d+)?$/;

/** Rounds to the nearest half unit: fine enough for a floor plan, coarse enough to line things up. */
const snap = (value) => Math.round(value * 2) / 2;

const readNumber = (value) => {
    const text = readText(value).replace(',', '.');
    return NUMBER.test(text) ? Number(text) : null;
};

/** Reads a size, snapped to half units; null when missing or out of range. */
const readSize = (value, min, max) => {
    const number = readNumber(value);
    if (number === null) return null;
    const snapped = snap(number);
    return snapped >= min && snapped <= max ? snapped : null;
};

/**
 * Converts a size in feet to the room's unit, snapped to half units and never below the minimum.
 * @param {number} feet
 * @param {string} unit - 'ft' or 'm'.
 * @returns {number}
 */
const sizeIn = (feet, unit) => (unit === 'm' ? Math.max(PIECE_SIZE_MIN, snap(feet / FEET_PER_METRE)) : feet);

/**
 * The default size and shape of a new fixture in the room's unit.
 * @param {string} kind - A key of LAYOUT_FIXTURES.
 * @param {string} unit
 * @returns {{width: number, depth: number, shape: string}}
 */
const fixtureDefaults = (kind, unit) => {
    const { width, depth, shape } = LAYOUT_FIXTURES[kind];
    return { width: sizeIn(width, unit), depth: sizeIn(depth, unit), shape };
};

/**
 * A seating table's footprint: a round table whose diameter grows with its seats.
 * @param {number} seats
 * @param {string} unit
 * @returns {{width: number, depth: number, shape: string}}
 */
const tableDefaults = (seats, unit) => {
    const feet = seats <= 8 ? 5 : seats <= 10 ? 6 : 7;
    return { width: sizeIn(feet, unit), depth: sizeIn(feet, unit), shape: 'round' };
};

/** Half the width and depth of a piece's bounding box once it is turned. */
const halfExtents = (piece) => {
    const radians = (piece.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return { x: (piece.width * cos + piece.depth * sin) / 2, y: (piece.width * sin + piece.depth * cos) / 2 };
};

/**
 * Keeps a piece inside the room: its centre moves until its (rotated) bounding box fits. A piece
 * larger than the room is centred on that axis.
 * @param {{x: number, y: number, width: number, depth: number, rotation: number}} piece
 * @param {{width: number, depth: number}} room
 * @returns {{x: number, y: number}} Snapped to half units.
 */
const clampToRoom = (piece, room) => {
    const half = halfExtents(piece);
    const fit = (value, extent, size) =>
        extent * 2 >= size ? size / 2 : Math.min(Math.max(value, extent), size - extent);
    return { x: snap(fit(piece.x, half.x, room.width)), y: snap(fit(piece.y, half.y, room.depth)) };
};

// Candidate spots are tried on a grid of about this many steps across the room's longer side, so
// the search costs the same in any room (a fine grid over a 500 × 500 room would take a second).
const SPOT_STEPS_ACROSS = 100;
const MIN_SPOT_STEP = 0.5;

/**
 * Where a new piece goes: the free spot nearest the middle of the room, so it never lands on top
 * of another piece. When nothing is free, the middle.
 * @param {{width: number, depth: number, rotation: number}} piece
 * @param {{width: number, depth: number}} room
 * @param {Array<{x: number, y: number, width: number, depth: number, rotation: number}>} others - Pieces already placed.
 * @returns {{x: number, y: number}}
 */
const findFreeSpot = (piece, room, others) => {
    const half = halfExtents(piece);
    const boxes = others.map((other) => ({ ...halfExtents(other), cx: other.x, cy: other.y }));
    const free = (x, y) =>
        boxes.every((box) => Math.abs(x - box.cx) >= half.x + box.x || Math.abs(y - box.cy) >= half.y + box.y);
    const middle = { x: snap(room.width / 2), y: snap(room.depth / 2) };
    // A multiple of half a unit, so every candidate is already snapped.
    const step = Math.max(MIN_SPOT_STEP, Math.ceil((Math.max(room.width, room.depth) / SPOT_STEPS_ACROSS) * 2) / 2);
    const candidates = [];
    for (let x = Math.ceil(half.x / step) * step; x <= room.width - half.x; x += step) {
        for (let y = Math.ceil(half.y / step) * step; y <= room.depth - half.y; y += step) {
            candidates.push({ x, y, d: Math.hypot(x - middle.x, y - middle.y) });
        }
    }
    if (
        free(middle.x, middle.y) &&
        middle.x >= half.x &&
        middle.x <= room.width - half.x &&
        middle.y >= half.y &&
        middle.y <= room.depth - half.y
    ) {
        return middle;
    }
    candidates.sort((a, b) => a.d - b.d);
    const spot = candidates.find(({ x, y }) => free(x, y));
    return spot ? { x: spot.x, y: spot.y } : clampToRoom({ ...piece, ...middle }, room);
};

/**
 * A piece's numbers in another unit, so changing the room from feet to metres keeps its real size.
 * @param {{x: number, y: number, width: number, depth: number}} piece
 * @param {string} from - 'ft' or 'm'.
 * @param {string} to - 'ft' or 'm'.
 * @returns {{x: number, y: number, width: number, depth: number}}
 */
const convertPiece = (piece, from, to) => {
    if (from === to) return { x: piece.x, y: piece.y, width: piece.width, depth: piece.depth };
    const factor = to === 'm' ? 1 / FEET_PER_METRE : FEET_PER_METRE;
    const size = (value) => Math.min(PIECE_SIZE_MAX, Math.max(PIECE_SIZE_MIN, snap(value * factor)));
    return { x: snap(piece.x * factor), y: snap(piece.y * factor), width: size(piece.width), depth: size(piece.depth) };
};

/**
 * A room's optional name, size and unit.
 * @param {object} [body] - req.body
 * @returns {{values: {name: string, width: string, depth: string, unit: string}, data: {name: string|null, width: number|null, depth: number|null, unit: string|null}, errors: Array}}
 */
const validateRoom = (body = {}) => {
    const values = {
        name: readText(body.name),
        width: readText(body.width),
        depth: readText(body.depth),
        unit: readText(body.unit)
    };
    const { errors, fail } = collectErrors();
    checkText(fail, 'name', values.name, { max: ROOM_NAME_MAX });
    const width = readSize(values.width, ROOM_SIZE_MIN, ROOM_SIZE_MAX);
    const depth = readSize(values.depth, ROOM_SIZE_MIN, ROOM_SIZE_MAX);
    const unit = readChoice(values.unit, LAYOUT_UNITS);
    const range = { min: ROOM_SIZE_MIN, max: ROOM_SIZE_MAX };
    if (width === null) fail('width', 'layout.sizeRange', range);
    if (depth === null) fail('depth', 'layout.sizeRange', range);
    if (!unit) fail('unit', 'validation.choice');
    return { values, data: { name: values.name || null, width, depth, unit }, errors };
};

/**
 * A new fixture: its kind and an optional label. Size and position come from the defaults.
 * @param {object} [body] - req.body
 * @returns {{values: {kind: string, label: string}, data: {kind: string|null, label: string|null}, errors: Array}}
 */
const validateNewFixture = (body = {}) => {
    const values = { kind: readText(body.kind), label: readText(body.label) };
    const { errors, fail } = collectErrors();
    const kind = readChoice(values.kind, Object.keys(LAYOUT_FIXTURES));
    if (!kind) fail('kind', 'validation.choice');
    checkText(fail, 'label', values.label, { max: LAYOUT_LABEL_MAX });
    return { values, data: { kind, label: values.label || null }, errors };
};

/**
 * Edits a piece: label, shape, position, size and rotation. The position is then kept inside the room.
 * @param {object} [body] - req.body
 * @param {{width: number, depth: number}} room
 * @returns {{values: Object<string, string>, data: {label: string|null, shape: string, x: number, y: number, width: number, depth: number, rotation: number}|null, errors: Array}}
 */
const validatePiece = (body = {}, room) => {
    const fields = ['label', 'shape', 'x', 'y', 'width', 'depth', 'rotation'];
    const values = Object.fromEntries(fields.map((field) => [field, readText(body[field])]));
    const { errors, fail } = collectErrors();
    checkText(fail, 'label', values.label, { max: LAYOUT_LABEL_MAX });
    const shape = readChoice(values.shape, LAYOUT_SHAPES);
    if (!shape) fail('shape', 'validation.choice');
    const sizeRange = { min: PIECE_SIZE_MIN, max: PIECE_SIZE_MAX };
    const width = readSize(values.width, PIECE_SIZE_MIN, PIECE_SIZE_MAX);
    const depth = readSize(values.depth, PIECE_SIZE_MIN, PIECE_SIZE_MAX);
    if (width === null) fail('width', 'layout.sizeRange', sizeRange);
    if (depth === null) fail('depth', 'layout.sizeRange', sizeRange);
    const x = readNumber(values.x);
    const y = readNumber(values.y);
    if (x === null) fail('x', 'layout.position');
    if (y === null) fail('y', 'layout.position');
    const rotation = /^\d{1,3}$/.test(values.rotation) ? Number(values.rotation) : null;
    if (rotation === null || rotation > DEGREES_MAX) fail('rotation', 'layout.rotationRange', { max: DEGREES_MAX });
    if (errors.length > 0) return { values, data: null, errors };
    const piece = { width, depth, rotation, x, y };
    return { values, data: { label: values.label || null, shape, ...piece, ...clampToRoom(piece, room) }, errors };
};

/**
 * A new position from drag and drop (or the move form), kept inside the room.
 * @param {object} [body] - req.body with x and y.
 * @param {{width: number, depth: number, rotation: number}} piece - The piece as stored.
 * @param {{width: number, depth: number}} room
 * @returns {{x: number, y: number}|null} Null when x or y is not a number.
 */
const readMove = (body = {}, piece, room) => {
    const x = readNumber(body.x);
    const y = readNumber(body.y);
    if (x === null || y === null) return null;
    return clampToRoom({ ...piece, x, y }, room);
};

export {
    clampToRoom,
    convertPiece,
    findFreeSpot,
    fixtureDefaults,
    tableDefaults,
    validateRoom,
    validateNewFixture,
    validatePiece,
    readMove
};
