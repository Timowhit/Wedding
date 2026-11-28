import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const MONDAY = '2027-03-15';
const TUESDAY = '2027-03-16';

describe('reminder choices: how far ahead, how often, and what', { skip: skipWithoutDb }, () => {
    let app;
    let rae;
    let raeId;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);
    const prefs = async () =>
        (
            await q(
                `SELECT reminder_emails, reminder_days, reminder_frequency, reminder_kinds FROM users WHERE id = $1;`,
                [raeId]
            )
        ).rows[0];
    const quiet = { info() {}, warn() {}, error() {} };
    const runFor = async (today) => {
        const { runReminders } = await import('../../src/services/reminders.js');
        await q(`UPDATE users SET reminders_sent_on = NULL;`);
        const sent = [];
        await runReminders({ today, send: async (message) => sent.push(message), log: quiet });
        return sent.filter((message) => message.to === 'rae@example.com');
    };

    before(async () => {
        app = await startTestApp();
        rae = await registeredClient(app.baseUrl, 'Rae', 'rae@example.com');
        raeId = (await q(`SELECT id FROM users WHERE email = 'rae@example.com';`)).rows[0].id;
        weddingId = (await q(`SELECT wedding_id FROM wedding_members WHERE user_id = $1;`, [raeId])).rows[0].wedding_id;
        await q(
            `INSERT INTO checklist_tasks (wedding_id, text, due_date) VALUES ($1, 'Soon task', '2027-03-17'), ($1, 'Later task', '2027-03-26');
             INSERT INTO appointments (wedding_id, title, starts_on) VALUES ($1, 'Cake tasting', '2027-03-16');
             INSERT INTO decisions (wedding_id, title, status) VALUES ($1, 'Pick a band', 'changes_requested');`.replaceAll(
                '$1',
                `'${weddingId}'`
            )
        );
    });
    after(() => app?.close());

    it('starts daily, 7 days ahead, with everything; the form shows that', async () => {
        assert.deepEqual(await prefs(), {
            reminder_emails: true,
            reminder_days: 7,
            reminder_frequency: 'daily',
            reminder_kinds: ['payments', 'tasks', 'decisions', 'appointments']
        });
        const page = (await rae.get('/settings')).body;
        assert.match(page, /<option value="7" selected/);
        assert.match(page, /<option value="daily" selected/);
        assert.match(page, /name="remind_appointments"[^>]*checked/);
    });

    it('saves days ahead, weekly, and only the kinds that are ticked', async () => {
        await rae.get('/settings');
        const saved = await rae.post('/settings/reminders', {
            reminder_emails: 'on',
            reminder_days: '14',
            reminder_frequency: 'weekly',
            remind_tasks: 'on',
            remind_appointments: 'on'
        });
        assert.equal(saved.location, '/settings');
        assert.deepEqual(await prefs(), {
            reminder_emails: true,
            reminder_days: 14,
            reminder_frequency: 'weekly',
            reminder_kinds: ['tasks', 'appointments']
        });
        const page = (await rae.get('/settings')).body;
        assert.match(page, /<option value="14" selected/);
        assert.doesNotMatch(page, /name="remind_payments"[^>]*checked/);
    });

    it('refuses an odd number of days, or reminders on with nothing ticked', async () => {
        await rae.get('/settings');
        const odd = await rae.post('/settings/reminders', {
            reminder_emails: 'on',
            reminder_days: '9999',
            reminder_frequency: 'daily',
            remind_tasks: 'on'
        });
        assert.equal(odd.status, 400);
        const nothing = await rae.post('/settings/reminders', {
            reminder_emails: 'on',
            reminder_days: '7',
            reminder_frequency: 'daily'
        });
        assert.equal(nothing.status, 400);
        assert.match(nothing.body, /Tick at least one kind of reminder/);
        assert.equal((await prefs()).reminder_days, 14, 'nothing saved');
    });

    it('the email follows the choices: only ticked kinds, as far ahead as chosen', async () => {
        const [message] = await runFor(MONDAY);
        assert.ok(message, 'weekly goes out on Mondays');
        assert.match(message.text, /Soon task/);
        assert.match(message.text, /Later task/, '14 days ahead');
        assert.match(message.text, /Cake tasting/);
        assert.doesNotMatch(message.text, /Pick a band/, 'decisions are not ticked');
        assert.match(message.text, /next 14 days/);
    });

    it('weekly sends nothing on other days; daily sends every day', async () => {
        assert.equal((await runFor(TUESDAY)).length, 0);
        await q(`UPDATE users SET reminder_frequency = 'daily', reminder_days = 3 WHERE id = $1;`, [raeId]);
        const [message] = await runFor(TUESDAY);
        assert.ok(message);
        assert.match(message.text, /Soon task/);
        assert.doesNotMatch(message.text, /Later task/, 'only 3 days ahead');
    });

    it('switching off still works with nothing ticked', async () => {
        await rae.get('/settings');
        assert.equal((await rae.post('/settings/reminders', {})).location, '/settings');
        assert.equal((await prefs()).reminder_emails, false);
    });
});
