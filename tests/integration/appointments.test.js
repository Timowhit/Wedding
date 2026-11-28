import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

/** YYYY-MM-DD, this many days from today (UTC, as the test app has no APP_TIME_ZONE). */
const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('appointments', { skip: skipWithoutDb }, () => {
    let app;
    let owner;
    let viewer;
    let outsider;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);
    const appointmentId = async (title) =>
        (await q(`SELECT id FROM appointments WHERE title = $1;`, [title])).rows[0]?.id;
    const tasting = {
        title: 'Menu tasting',
        starts_on: inDays(3),
        starts_at: '14:30',
        ends_at: '16:00',
        location: 'Riverside Kitchen',
        attendees: 'Ana, Luis, the caterer',
        notes: 'Bring the guest count.'
    };

    before(async () => {
        app = await startTestApp();
        owner = await registeredClient(app.baseUrl, 'Ana', 'ana@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        weddingId = (
            await q(
                `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'ana@example.com';`
            )
        ).rows[0].wedding_id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) SELECT $1, id, 'viewer' FROM users WHERE email = 'vik@example.com';`,
            [weddingId]
        );
        await viewer.get('/');
        await viewer.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        await owner.get('/appointments');
    });
    after(() => app?.close());

    it('an editor adds an appointment with a time, place and who is coming', async () => {
        const page = await owner.get('/appointments');
        assert.equal(page.status, 200);
        assert.match(page.body, /href="\/appointments"/, 'in the menu');
        assert.equal((await owner.post('/appointments', tasting)).location, '/appointments');
        const text = textOf((await owner.get('/appointments')).body);
        assert.match(text, /Menu tasting/);
        assert.match(text, /2:30 PM – 4:00 PM/);
        assert.match(text, /Riverside Kitchen/);
        assert.match(text, /Ana, Luis, the caterer/);
    });

    it('needs a title and a date; the end can’t be before the start', async () => {
        assert.equal((await owner.post('/appointments', { ...tasting, title: '' })).status, 400);
        assert.equal((await owner.post('/appointments', { ...tasting, starts_on: '' })).status, 400);
        const backwards = await owner.post('/appointments', { ...tasting, starts_at: '16:00', ends_at: '15:00' });
        assert.equal(backwards.status, 400);
        assert.match(backwards.body, /value="Riverside Kitchen"/, 'what was typed is kept');
        const noDate = await owner.post('/appointments', { ...tasting, starts_on: '', ends_at: '', starts_at: 'x' });
        assert.doesNotMatch(noDate.body, /field\.[a-z_]+/, 'errors are labelled in words');
    });

    it('shows the next appointments on the dashboard and on the calendar', async () => {
        await q(`INSERT INTO appointments (wedding_id, title, starts_on) VALUES ($1, 'Long gone fitting', $2::date);`, [
            weddingId,
            inDays(-30)
        ]);
        const dashboard = textOf((await owner.get('/')).body);
        assert.match(dashboard, /Next appointments/);
        assert.match(dashboard, /Menu tasting/);
        assert.doesNotMatch(dashboard, /Long gone fitting/, 'past ones are left out');
        const month = inDays(3).slice(0, 7);
        const calendar = textOf((await owner.get(`/calendar?month=${month}`)).body);
        assert.match(calendar, /Appointment/);
        assert.match(calendar, /Menu tasting/);
    });

    it('is in the daily reminder for the people who plan', async () => {
        const { findReminderDigest } = await import('../../src/models/reminders.js');
        const ownerId = (await q(`SELECT id FROM users WHERE email = 'ana@example.com';`)).rows[0].id;
        const digest = await findReminderDigest(ownerId, inDays(0));
        const wedding = digest.find((row) => row.id === weddingId);
        assert.ok(wedding, 'the wedding has something to report');
        assert.deepEqual(
            wedding.appointments.map((a) => a.title),
            ['Menu tasting']
        );
    });

    it('edits and deletes; viewers only read; other weddings get 404', async () => {
        const id = await appointmentId('Menu tasting');
        const edit = await owner.get(`/appointments/${id}/edit`);
        assert.match(edit.body, /value="Riverside Kitchen"/);
        await owner.post(`/appointments/${id}/edit`, { ...tasting, location: 'Hill House' });
        assert.equal(
            (await q(`SELECT location FROM appointments WHERE id = $1;`, [id])).rows[0].location,
            'Hill House'
        );

        const asViewer = await viewer.get('/appointments');
        assert.match(textOf(asViewer.body), /Menu tasting/);
        assert.doesNotMatch(asViewer.body, /action="\/appointments"/);
        await viewer.post(`/appointments/${id}/delete`, {});
        assert.ok(await appointmentId('Menu tasting'));

        await outsider.get('/appointments');
        assert.equal((await outsider.get(`/appointments/${id}/edit`)).status, 404);
        assert.equal((await outsider.post(`/appointments/${id}/delete`, {})).status, 404);

        await owner.post(`/appointments/${id}/delete`, {});
        assert.equal(await appointmentId('Menu tasting'), undefined);
    });
});
