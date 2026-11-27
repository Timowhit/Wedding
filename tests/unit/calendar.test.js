import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, readMonth, shiftMonth } from '../../src/utils/calendar.js';

describe('calendar helpers', () => {
    it('reads YYYY-MM, falling back to the month of today', () => {
        assert.equal(readMonth('2027-03', '2026-11-27'), '2027-03');
        for (const bad of ['2027-13', '2027-00', 'nope', '', undefined, '1800-01', '2027-3']) {
            assert.equal(readMonth(bad, '2026-11-27'), '2026-11', String(bad));
        }
    });

    it('shifts months across years', () => {
        assert.equal(shiftMonth('2027-01', -1), '2026-12');
        assert.equal(shiftMonth('2026-12', 1), '2027-01');
    });

    it('builds Monday-first weeks covering the whole month', () => {
        const grid = monthGrid('2027-03');
        assert.equal(grid.from, '2027-03-01');
        assert.equal(grid.to, '2027-03-31');
        assert.equal(grid.weeks[0][0].day, '2027-03-01', '1 March 2027 is a Monday');
        assert.ok(grid.weeks.every((week) => week.length === 7));
        const last = grid.weeks.at(-1);
        assert.equal(last.at(-1).day, '2027-04-04');
        assert.equal(last.at(-1).inMonth, false);
        const feb = monthGrid('2026-02');
        assert.equal(feb.weeks[0][0].day, '2026-01-26', 'leading days come from the previous month');
    });
});
