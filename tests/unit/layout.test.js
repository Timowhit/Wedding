import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    clampToRoom,
    findFreeSpot,
    fixtureDefaults,
    readMove,
    tableDefaults,
    validatePiece,
    validateRoom
} from '../../src/validators/layout.js';

const room = { width: 60, depth: 40 };

describe('venue layout rules', () => {
    it('keeps a piece inside the room, using its turned footprint', () => {
        assert.deepEqual(clampToRoom({ x: 100, y: -3, width: 20, depth: 10, rotation: 0 }, room), { x: 50, y: 5 });
        assert.deepEqual(clampToRoom({ x: 100, y: 20, width: 20, depth: 10, rotation: 90 }, room), { x: 55, y: 20 });
        const diagonal = clampToRoom({ x: 0, y: 0, width: 10, depth: 10, rotation: 45 }, room);
        assert.deepEqual(diagonal, { x: 7, y: 7 }, 'a square turned 45° needs about 7.07 of room each side');
        assert.deepEqual(
            clampToRoom({ x: 3, y: 3, width: 80, depth: 50, rotation: 0 }, room),
            { x: 30, y: 20 },
            'too big: centred'
        );
    });

    it('snaps positions and sizes to half units', () => {
        assert.deepEqual(readMove({ x: '12.26', y: '7.74' }, { width: 2, depth: 2, rotation: 0 }, room), {
            x: 12.5,
            y: 7.5
        });
        assert.equal(readMove({ x: 'left', y: '1' }, { width: 2, depth: 2, rotation: 0 }, room), null);
        const { data } = validatePiece(
            { label: '', shape: 'rect', x: '10', y: '10', width: '3.3', depth: '1,2', rotation: '0' },
            room
        );
        assert.deepEqual([data.width, data.depth], [3.5, 1]);
    });

    it('defaults: metric sizes, and tables that grow with their seats', () => {
        assert.deepEqual(fixtureDefaults('dance_floor', 'ft'), { width: 20, depth: 20, shape: 'rect' });
        assert.deepEqual(fixtureDefaults('dance_floor', 'm'), { width: 6, depth: 6, shape: 'rect' });
        assert.deepEqual(fixtureDefaults('entrance', 'm'), { width: 2, depth: 0.5, shape: 'rect' });
        assert.deepEqual(
            [tableDefaults(8, 'ft').width, tableDefaults(10, 'ft').width, tableDefaults(12, 'ft').width],
            [5, 6, 7]
        );
    });

    it('rooms are 5 to 500 units in feet or metres', () => {
        assert.equal(validateRoom({ width: '60', depth: '40', unit: 'ft' }).errors.length, 0);
        assert.deepEqual(
            validateRoom({ width: '4', depth: '501', unit: 'yd' }).errors.map((e) => e.field),
            ['width', 'depth', 'unit']
        );
    });

    it('new pieces go to the free spot nearest the middle, not on top of others', () => {
        const piece = { width: 6, depth: 6, rotation: 0 };
        assert.deepEqual(findFreeSpot(piece, room, []), { x: 30, y: 20 }, 'an empty room: the middle');
        const table = { x: 30, y: 20, width: 6, depth: 6, rotation: 0 };
        const spot = findFreeSpot(piece, room, [table]);
        const gapX = Math.abs(spot.x - 30) - 6;
        const gapY = Math.abs(spot.y - 20) - 6;
        assert.ok(gapX >= 0 || gapY >= 0, `no overlap: ${JSON.stringify(spot)}`);
        assert.ok(Math.hypot(spot.x - 30, spot.y - 20) <= 8, 'still close to the middle');
        const full = [{ x: 30, y: 20, width: 60, depth: 40, rotation: 0 }];
        assert.deepEqual(findFreeSpot(piece, room, full), { x: 30, y: 20 }, 'no room left: the middle anyway');
    });
});
