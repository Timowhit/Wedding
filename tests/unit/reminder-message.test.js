import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderMessage } from '../../src/services/reminders.js';

describe('reminder email: appointments', () => {
    const user = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'a@example.com',
        language: 'en',
        account_type: 'couple'
    };
    const wedding = (appointments) => ({
        id: 'w',
        name: 'Ana & Luis',
        payments: [],
        tasks: [],
        decisions: [],
        appointments
    });

    it('lists each appointment with its day, time and place, under its own heading', () => {
        const { text, html } = buildReminderMessage(user, [
            wedding([
                {
                    title: 'Menu tasting',
                    starts_on: new Date('2027-03-04T00:00:00Z'),
                    starts_at: '14:30',
                    location: 'Riverside'
                },
                { title: 'Dress fitting', starts_on: new Date('2027-03-05T00:00:00Z'), starts_at: null, location: null }
            ])
        ]);
        assert.match(text, /Appointments/);
        assert.match(text, /- Menu tasting, .*2027 at 2:30 PM, Riverside/);
        assert.match(text, /- Dress fitting, Friday, March 5, 2027\n/);
        assert.match(html, /Menu tasting/);
    });
});
