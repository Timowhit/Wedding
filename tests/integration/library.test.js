import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';

const textOf = (html) =>
    html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&rsquo;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ');

describe('messages and questionnaires library', { skip: skipWithoutDb }, () => {
    let app;
    let pia;
    let cal;
    let viewer;
    let outsider;
    let weddingId;
    const q = (sql, params) => app.pool.query(sql, params);

    before(async () => {
        app = await startTestApp();
        pia = await registeredClient(app.baseUrl, 'Pia', 'pia@example.com');
        cal = await registeredClient(app.baseUrl, 'Cal', 'cal@example.com');
        viewer = await registeredClient(app.baseUrl, 'Vik', 'vik@example.com');
        outsider = await registeredClient(app.baseUrl, 'Oli', 'oli@example.com');
        const ids = Object.fromEntries((await q(`SELECT email, id FROM users;`)).rows.map((r) => [r.email, r.id]));
        await q(`UPDATE users SET account_type = 'planner', business_name = 'Pia Events' WHERE id = $1;`, [
            ids['pia@example.com']
        ]);
        weddingId = (
            await q(
                `UPDATE weddings SET planner_managed = true, name = 'Cal and Dani', wedding_date = '2027-09-18'
                 WHERE id = (SELECT wedding_id FROM wedding_members WHERE user_id = $1 AND role = 'owner') RETURNING id;`,
                [ids['pia@example.com']]
            )
        ).rows[0].id;
        await q(
            `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'client'), ($1, $3, 'viewer');`,
            [weddingId, ids['cal@example.com'], ids['vik@example.com']]
        );
        for (const client of [cal, viewer]) {
            await client.get('/');
            await client.post('/wedding/switch', { wedding_id: weddingId, return_to: '/' });
        }
        await pia.get('/library');
    });
    after(() => app?.close());

    const messageId = async (name) =>
        (await q(`SELECT id FROM message_templates WHERE name = $1;`, [name])).rows[0]?.id;
    const questionnaireId = async (title) =>
        (await q(`SELECT id FROM questionnaires WHERE title = $1;`, [title])).rows[0]?.id;

    describe('message templates', () => {
        it('saves a message and fills it in for the active wedding', async () => {
            const saved = await pia.post('/library/messages', {
                kind: 'follow_up',
                name: 'After the venue visit',
                subject: 'Lovely to meet you, {couple}',
                body: 'Hi {couple}! {days_left} days to go until {date}. Best, {planner}. {unknown} stays.'
            });
            assert.equal(saved.location, '/library');
            const use = await pia.get(`/library/messages/${await messageId('After the venue visit')}/use`);
            assert.equal(use.status, 200);
            const text = textOf(use.body);
            assert.match(text, /Lovely to meet you, Cal and Dani/);
            assert.match(
                text,
                /Hi Cal and Dani! \d+ days to go until Saturday, September 18, 2027\. Best, Pia Events\. \{unknown\} stays\./
            );
            assert.match(use.body, /href="mailto:cal@example\.com[^"]*subject=Lovely%20to%20meet%20you/);
        });

        it('names are unique per kind; a missing body is refused', async () => {
            const dupe = await pia.post('/library/messages', {
                kind: 'follow_up',
                name: 'After the venue visit',
                subject: '',
                body: 'x'
            });
            assert.equal(dupe.status, 400);
            assert.equal(
                (await pia.post('/library/messages', { kind: 'email', name: 'Empty', subject: '', body: '' })).status,
                400
            );
            assert.equal(
                (await pia.post('/library/messages', { kind: 'letter', name: 'Odd', subject: '', body: 'x' })).status,
                400
            );
        });

        it('edits and deletes; another person gets 404', async () => {
            const id = await messageId('After the venue visit');
            await pia.post(`/library/messages/${id}/edit`, {
                kind: 'follow_up',
                name: 'Venue follow-up',
                subject: 'Hi',
                body: 'Thanks'
            });
            assert.equal(
                (await q(`SELECT name FROM message_templates WHERE id = $1;`, [id])).rows[0].name,
                'Venue follow-up'
            );
            await outsider.get('/library');
            assert.equal((await outsider.get(`/library/messages/${id}/use`)).status, 404);
            assert.equal((await outsider.post(`/library/messages/${id}/delete`, {})).status, 404);
            assert.equal((await pia.post(`/library/messages/${id}/delete`, {})).location, '/library');
            assert.equal(await messageId('Venue follow-up'), undefined);
        });
    });

    describe('questionnaires', () => {
        it('the builder keeps filled rows, drops empty ones and needs options for a choice', async () => {
            const bad = await pia.post('/library/questionnaires', {
                title: 'Getting to know you',
                intro: '',
                q0_text: 'Favourite colours?',
                q0_type: 'choice',
                q0_options: ''
            });
            assert.equal(bad.status, 400);
            const saved = await pia.post('/library/questionnaires', {
                title: 'Getting to know you',
                intro: 'A few questions before we start.',
                q0_text: 'How did you meet?',
                q0_type: 'long',
                q0_options: '',
                q1_text: '',
                q1_type: 'short',
                q1_options: '',
                q2_text: 'Ceremony style',
                q2_type: 'choice',
                q2_options: 'Religious\nCivil\nSymbolic'
            });
            assert.equal(saved.location, '/library');
            const row = (await q(`SELECT questions FROM questionnaires WHERE title = 'Getting to know you';`)).rows[0];
            assert.deepEqual(row.questions, [
                { text: 'How did you meet?', type: 'long', options: [] },
                { text: 'Ceremony style', type: 'choice', options: ['Religious', 'Civil', 'Symbolic'] }
            ]);
        });

        it('sending copies it into the wedding; later edits do not change what was sent', async () => {
            const id = await questionnaireId('Getting to know you');
            await pia.get('/questionnaires');
            assert.equal(
                (await pia.post('/questionnaires/send', { questionnaire_id: id })).location,
                '/questionnaires'
            );
            await pia.post(`/library/questionnaires/${id}/edit`, {
                title: 'Renamed',
                intro: '',
                q0_text: 'Changed?',
                q0_type: 'short',
                q0_options: ''
            });
            const page = textOf((await cal.get('/questionnaires')).body);
            assert.match(page, /Getting to know you/);
            assert.doesNotMatch(page, /Renamed/);
        });

        it('the couple answers; a choice must be one of the options; the planner sees the answers', async () => {
            const sent = (await q(`SELECT id FROM wedding_questionnaires WHERE wedding_id = $1;`, [weddingId])).rows[0]
                .id;
            await cal.get(`/questionnaires/${sent}`);
            const wrong = await cal.post(`/questionnaires/${sent}/answers`, {
                a0: 'At a friend’s wedding',
                a1: 'Underwater'
            });
            assert.equal(wrong.status, 400);
            const ok = await cal.post(`/questionnaires/${sent}/answers`, { a0: 'At a friend’s wedding', a1: 'Civil' });
            assert.equal(ok.location, `/questionnaires/${sent}`);
            const planner = textOf((await pia.get(`/questionnaires/${sent}`)).body);
            assert.match(planner, /At a friend’s wedding/);
            assert.match(planner, /Civil/);
            assert.match(planner, /Answered by Cal/);
        });

        it('viewers, askers and other weddings cannot answer', async () => {
            const sent = (await q(`SELECT id FROM wedding_questionnaires WHERE wedding_id = $1;`, [weddingId])).rows[0]
                .id;
            await viewer.get(`/questionnaires/${sent}`);
            await viewer.post(`/questionnaires/${sent}/answers`, { a0: 'Viewer was here', a1: 'Civil' });
            await pia.post(`/questionnaires/${sent}/answers`, { a0: 'Planner was here', a1: 'Civil' });
            const answers = (await q(`SELECT answers FROM wedding_questionnaires WHERE id = $1;`, [sent])).rows[0]
                .answers;
            assert.equal(answers[0], 'At a friend’s wedding');
            await outsider.get('/questionnaires');
            assert.equal((await outsider.get(`/questionnaires/${sent}`)).status, 404);
            assert.equal(
                (await outsider.post('/questionnaires/send', { questionnaire_id: await questionnaireId('Renamed') }))
                    .status,
                404
            );
        });
    });

    describe('review fixes', () => {
        it('clients cannot send or remove questionnaires in a planner wedding', async () => {
            const page = await cal.get('/questionnaires');
            assert.doesNotMatch(page.body, /action="\/questionnaires\/send"/);
            const before = (
                await q(`SELECT COUNT(*)::int AS n FROM wedding_questionnaires WHERE wedding_id = $1;`, [weddingId])
            ).rows[0].n;
            const sent = (await q(`SELECT id FROM wedding_questionnaires WHERE wedding_id = $1 LIMIT 1;`, [weddingId]))
                .rows[0].id;
            const sentPage = await cal.get(`/questionnaires/${sent}`);
            assert.doesNotMatch(sentPage.body, /questionnaires\/[0-9a-f-]+\/delete/);
            await cal.post(`/questionnaires/${sent}/delete`, {});
            const calsOwn = await q(
                `INSERT INTO questionnaires (user_id, title, questions) SELECT id, 'Cal list', '[{"text":"Q","type":"short","options":[]}]' FROM users WHERE email = 'cal@example.com' RETURNING id;`
            );
            await cal.post('/questionnaires/send', { questionnaire_id: calsOwn.rows[0].id });
            const after = (
                await q(`SELECT COUNT(*)::int AS n FROM wedding_questionnaires WHERE wedding_id = $1;`, [weddingId])
            ).rows[0].n;
            assert.equal(after, before);
        });

        it('long messages in any language fit (no 413)', async () => {
            await pia.get('/library');
            const body = 'áéíóú ñ¿¡ '.repeat(1000).slice(0, 10000);
            const saved = await pia.post('/library/messages', {
                kind: 'proposal',
                name: 'Long Spanish',
                subject: '',
                body
            });
            assert.equal(saved.location, '/library');
        });

        it('questionnaires are in the navigation for planners in any wedding they belong to', async () => {
            assert.match((await pia.get('/')).body, /href="\/questionnaires"/);
            assert.match((await cal.get('/')).body, /href="\/questionnaires"/);
        });
    });

    describe('adding and removing questions', () => {
        const twoRows = (extra) => ({
            title: 'Draft',
            intro: '',
            q0_text: 'First?',
            q0_type: 'short',
            q0_options: '',
            q1_text: 'Second?',
            q1_type: 'short',
            q1_options: '',
            ...extra
        });
        const rowValues = (body) => [...body.matchAll(/name="q\d+_text"[^>]*value="([^"]*)"/g)].map((m) => m[1]);

        it('+ on a question adds an empty one just under it, without saving', async () => {
            await pia.get('/library/questionnaires/new');
            const page = await pia.post('/library/questionnaires', twoRows({ row_action: 'add:0' }));
            assert.equal(page.status, 200);
            assert.deepEqual(rowValues(page.body), ['First?', '', 'Second?']);
            assert.match(page.body, /id="q1-text"[^>]*autofocus/, 'the new question is focused');
            assert.equal(await questionnaireId('Draft'), undefined, 'nothing saved yet');
        });

        it('− on a question removes it, without saving', async () => {
            const page = await pia.post('/library/questionnaires', twoRows({ row_action: 'remove:0' }));
            assert.equal(page.status, 200);
            assert.deepEqual(rowValues(page.body), ['Second?']);
            assert.equal(await questionnaireId('Draft'), undefined, 'nothing saved yet');
        });

        it('the last question cannot be removed, and its − is disabled', async () => {
            const page = await pia.post('/library/questionnaires', {
                title: 'Draft',
                q0_text: 'Only?',
                q0_type: 'short',
                row_action: 'remove:0'
            });
            assert.deepEqual(rowValues(page.body), ['Only?']);
            assert.match(page.body, /<button[^>]*value="remove:0"[^>]*disabled/);
        });

        it('each question has a −/+ pill naming it, and Enter still saves', async () => {
            const page = await pia.get('/library/questionnaires/new');
            assert.match(page.body, /value="remove:0"[^>]*aria-label="Remove question 1"/);
            assert.match(page.body, /value="add:0"[^>]*aria-label="Add a question under question 1"/);
            // Pressing Enter in a field clicks the form's first submit button: it must be Save.
            const form = page.body.slice(page.body.indexOf('data-question-builder'));
            const firstSubmit = /<button type="submit"[^>]*>/.exec(form)[0];
            assert.doesNotMatch(firstSubmit, /row_action/);
            assert.doesNotMatch(page.body, /_remove"/, 'no tick boxes any more');
        });

        it('ignores a made-up row action', async () => {
            const page = await pia.post('/library/questionnaires', twoRows({ row_action: 'add:99' }));
            assert.deepEqual(rowValues(page.body), ['First?', 'Second?']);
        });
    });
});
