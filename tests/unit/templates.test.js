import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    checklistItemsFrom,
    daysBefore,
    dueDateFrom,
    normaliseChecklistItems,
    normaliseScheduleItems,
    scheduleItemsFrom,
    validateTemplateName
} from '../../src/validators/templates.js';

describe('template helpers', () => {
    it('daysBefore and dueDateFrom round-trip across month ends', () => {
        assert.equal(daysBefore('2027-03-31', '2026-12-31'), 90);
        assert.equal(dueDateFrom('2027-03-31', 90), '2026-12-31');
        assert.equal(daysBefore('2027-03-14', '2027-03-14'), 0);
        assert.equal(daysBefore('2027-03-14', '2027-03-20'), -6, 'after the wedding');
        assert.equal(dueDateFrom('2027-03-14', -6), '2027-03-20');
        // Across a DST change (US, 14 March 2027) the count stays in whole days.
        assert.equal(daysBefore('2027-03-15', '2027-03-13'), 2);
        assert.equal(dueDateFrom('2028-03-01', 1), '2028-02-29');
    });

    it('null when either date is missing', () => {
        assert.equal(daysBefore(null, '2027-01-01'), null);
        assert.equal(daysBefore('2027-01-01', null), null);
        assert.equal(dueDateFrom(null, 30), null);
        assert.equal(dueDateFrom('2027-01-01', null), null);
    });

    it('checklistItemsFrom keeps text, category and days before', () => {
        const tasks = [
            { text: 'Book the venue', category: 'Venue', due_date: new Date(2026, 2, 14), done: true },
            { text: 'Send invitations', category: 'Invitations', due_date: null, done: false }
        ];
        assert.deepEqual(checklistItemsFrom(tasks, '2027-03-14'), [
            { text: 'Book the venue', category: 'Venue', daysBefore: 365 },
            { text: 'Send invitations', category: 'Invitations', daysBefore: null }
        ]);
        assert.deepEqual(checklistItemsFrom(tasks, null)[0].daysBefore, null);
    });

    it('scheduleItemsFrom drops vendor and contact', () => {
        const [item] = scheduleItemsFrom([
            {
                starts_at: '15:30',
                ends_at: '16:00',
                title: 'Ceremony',
                location: 'Garden',
                vendor_id: 'x',
                vendor_name: 'DJ Nova',
                contact: '555',
                notes: 'Chairs by 15:00',
                contingency: 'Barn if rain'
            }
        ]);
        assert.deepEqual(item, {
            startsAt: '15:30',
            endsAt: '16:00',
            title: 'Ceremony',
            location: 'Garden',
            notes: 'Chairs by 15:00',
            contingency: 'Barn if rain'
        });
    });

    it('normalisers skip broken items and map unknown categories', () => {
        assert.deepEqual(
            normaliseChecklistItems([
                { text: 'Ok', category: 'Venue', daysBefore: 10 },
                { text: 'Old category', category: 'Fireworks', daysBefore: 'x' },
                { text: '', category: 'Venue' },
                null,
                'nonsense'
            ]),
            [
                { text: 'Ok', category: 'Venue', daysBefore: 10 },
                { text: 'Old category', category: 'Other', daysBefore: null }
            ]
        );
        assert.deepEqual(normaliseChecklistItems('not an array'), []);
        assert.deepEqual(
            normaliseScheduleItems([
                { startsAt: '25:00', title: 'Bad time' },
                { startsAt: '09:00', endsAt: 'nope', title: 'Hair' },
                { startsAt: '10:00' }
            ]),
            [{ startsAt: '09:00', endsAt: null, title: 'Hair', location: null, notes: null, contingency: null }]
        );
    });

    it('template names are required and at most 120 characters', () => {
        assert.deepEqual(validateTemplateName({ name: '  Full service  ' }).data, { name: 'Full service' });
        assert.equal(validateTemplateName({ name: '' }).errors[0].key, 'validation.required');
        assert.equal(validateTemplateName({ name: 'x'.repeat(121) }).errors[0].key, 'validation.tooLong');
    });
});
