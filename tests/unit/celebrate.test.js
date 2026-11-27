import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { celebrationFor } from '../../src/utils/celebrate.js';

describe('task celebrations', () => {
    it('celebrates every completed task, and names the milestone just crossed', () => {
        assert.deepEqual(celebrationFor({ done: 1, total: 10 }), { done: 1, total: 10, pct: 10, milestone: null });
        assert.deepEqual(celebrationFor({ done: 3, total: 10 }), { done: 3, total: 10, pct: 30, milestone: 25 });
        assert.deepEqual(celebrationFor({ done: 5, total: 10 }), { done: 5, total: 10, pct: 50, milestone: 50 });
        assert.deepEqual(celebrationFor({ done: 6, total: 10 }), { done: 6, total: 10, pct: 60, milestone: null });
        assert.deepEqual(celebrationFor({ done: 10, total: 10 }), { done: 10, total: 10, pct: 100, milestone: 100 });
    });

    it('a jump past several milestones names the highest; a single task is 100%', () => {
        assert.equal(celebrationFor({ done: 2, total: 3 }).milestone, 50);
        assert.equal(celebrationFor({ done: 1, total: 1 }).milestone, 100);
    });

    it('milestones follow the rounded percentage people see', () => {
        assert.equal(celebrationFor({ done: 47, total: 63 }).milestone, 75, '47/63 shows 75%');
        assert.equal(celebrationFor({ done: 48, total: 63 }).milestone, null);
    });
});
