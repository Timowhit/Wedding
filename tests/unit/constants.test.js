import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET_CATEGORIES, VENDOR_BUDGET_CATEGORY, VENDOR_CATEGORIES } from '../../src/constants.js';

describe('constants', () => {
    it('every vendor category maps to a budget category', () => {
        for (const category of VENDOR_CATEGORIES) {
            assert.ok(BUDGET_CATEGORIES.includes(VENDOR_BUDGET_CATEGORY[category]), category);
        }
    });
});
