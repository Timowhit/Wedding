import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient, registeredClient, skipWithoutDb, startTestApp } from '../helpers/app.js';
import { todayIso } from '../../src/utils/today.js';

const TODAY = '2027-03-15';

describe('payments', { skip: skipWithoutDb }, () => {
    let app;
    let m;

    /** Inserts a wedding (optionally owned by userId) and returns its id. */
    const newWedding = async (name, { date = null, userId = null } = {}) => {
        const { rows } = await app.pool.query(
            'INSERT INTO weddings (name, wedding_date) VALUES ($1, $2) RETURNING id;',
            [name, date]
        );
        if (userId) {
            await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'owner');`, [
                rows[0].id,
                userId
            ]);
        }
        return rows[0].id;
    };
    const newVendor = async (
        weddingId,
        { name = 'Vendor', category = 'Florist', status = 'Booked', total = null } = {}
    ) =>
        (
            await app.pool.query(
                `INSERT INTO vendors (wedding_id, name, category, status, contract_total)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
                [weddingId, name, category, status, total]
            )
        ).rows[0].id;
    const pay = (weddingId, vendorId, amount, { due = null, paid = null } = {}) =>
        app.pool.query(
            `INSERT INTO vendor_payments (wedding_id, vendor_id, amount, due_date, paid_on) VALUES ($1, $2, $3, $4, $5);`,
            [weddingId, vendorId, amount, due, paid]
        );
    const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

    before(async () => {
        app = await startTestApp();
        m = await import('../../src/models/payments.js');
    });
    after(() => app?.close());

    describe('money', () => {
        it('booked vendor: total only, payments only, both, overpaid', async () => {
            const w = await newWedding('Money A');
            const totalOnly = await newVendor(w, { total: 4800 });
            const paymentsOnly = await newVendor(w);
            await pay(w, paymentsOnly, 1000, { paid: '2027-01-01' });
            await pay(w, paymentsOnly, 500);
            const both = await newVendor(w, { total: 4800 });
            await pay(w, both, 1200, { paid: '2027-01-01' });
            await pay(w, both, 1800);
            const overpaid = await newVendor(w, { total: 4800 });
            await pay(w, overpaid, 5100, { paid: '2027-01-01' });

            const money = await m.findVendorMoney(w, TODAY);
            const keys = ['counts', 'committed', 'paid', 'owed', 'unscheduled'];
            assert.deepEqual(pick(money.get(totalOnly), keys), {
                counts: true,
                committed: 4800,
                paid: 0,
                owed: 4800,
                unscheduled: 4800
            });
            assert.deepEqual(pick(money.get(paymentsOnly), keys), {
                counts: true,
                committed: 1500,
                paid: 1000,
                owed: 500,
                unscheduled: null
            });
            assert.deepEqual(pick(money.get(both), keys), {
                counts: true,
                committed: 4800,
                paid: 1200,
                owed: 3600,
                unscheduled: 1800
            });
            assert.deepEqual(pick(money.get(overpaid), keys), {
                counts: true,
                committed: 5100,
                paid: 5100,
                owed: 0,
                unscheduled: -300
            });
        });

        it('researching vendor counts nothing and shows a quote', async () => {
            const w = await newWedding('Money B');
            const v = await newVendor(w, { status: 'Researching', total: 3000 });
            await pay(w, v, 500, { due: '2027-03-20' });
            const row = (await m.findVendorMoney(w, TODAY)).get(v);
            assert.deepEqual(pick(row, ['counts', 'quote', 'committed', 'owed']), {
                counts: false,
                quote: 3000,
                committed: 0,
                owed: 0
            });
            assert.deepEqual(pick(await m.findMoneySummary(w), ['committed', 'paid', 'owed']), {
                committed: 0,
                paid: 0,
                owed: 0
            });
            assert.equal((await m.findPaymentsDue(w, { today: TODAY })).length, 0);
        });

        it('declined vendor keeps only paid money', async () => {
            const w = await newWedding('Money C');
            const v = await newVendor(w, { status: 'Declined', total: 4800 });
            await pay(w, v, 1200, { paid: '2027-01-10' });
            await pay(w, v, 1800, { due: '2027-03-01' });
            assert.deepEqual(pick((await m.findVendorMoney(w, TODAY)).get(v), ['committed', 'paid', 'owed']), {
                committed: 1200,
                paid: 1200,
                owed: 0
            });
            assert.deepEqual(pick(await m.findMoneySummary(w), ['committed', 'paid', 'owed']), {
                committed: 1200,
                paid: 1200,
                owed: 0
            });
            assert.equal((await m.findPaymentsDue(w, { today: TODAY })).length, 0);
        });

        it('summary adds expenses as paid and compares with the limit', async () => {
            const w = await newWedding('Money D');
            const v = await newVendor(w, { total: 4800 });
            await pay(w, v, 1200, { paid: '2027-01-01' });
            await app.pool.query(
                `INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Dress alterations', 'Attire', 450);
                 INSERT INTO budget_limits (wedding_id, total) VALUES ($1, 5000);`.replaceAll('$1', `'${w}'`)
            );
            assert.deepEqual(await m.findMoneySummary(w), {
                limit: 5000,
                committed: 5250,
                paid: 1650,
                owed: 3600,
                expenses: 450,
                over: true
            });
        });

        it("overpaying one vendor never hides another's debt", async () => {
            const w = await newWedding('Money E');
            const a = await newVendor(w, { total: 1000 });
            await pay(w, a, 1300, { paid: '2027-01-01' });
            await newVendor(w, { total: 2000 });
            assert.equal((await m.findMoneySummary(w)).owed, 2000);
        });

        it('payments due: overdue first, then the next 30 days', async () => {
            const w = await newWedding('Money F');
            const v = await newVendor(w, { name: 'Golden Hour', total: 3000 });
            await pay(w, v, 100, { due: '2027-04-24' }); // 40 days ahead
            await pay(w, v, 200, { due: '2027-03-25' }); // 10 days ahead
            await pay(w, v, 300, { due: '2027-03-10' }); // 5 days overdue
            await pay(w, v, 400, { due: '2027-03-01', paid: '2027-03-01' }); // paid
            const due = await m.findPaymentsDue(w, { today: TODAY });
            assert.deepEqual(
                due.map((d) => [d.amount, d.overdue, d.vendor_name]),
                [
                    [300, true, 'Golden Hour'],
                    [200, false, 'Golden Hour']
                ]
            );
        });

        it('planner filters: this month, next 30 days, overdue', async () => {
            const { rows } = await app.pool.query(
                `INSERT INTO users (email, display_name, account_type) VALUES ('pf@example.com', 'PF', 'planner') RETURNING id;`
            );
            const userId = rows[0].id;
            const upcoming = await newWedding('Upcoming', { date: '2027-09-01', userId });
            const past = await newWedding('Past', { date: '2026-06-01', userId });
            const v = await newVendor(upcoming, { total: 5000 });
            await pay(upcoming, v, 10, { due: '2027-03-28' });
            await pay(upcoming, v, 20, { due: '2027-04-10' });
            await pay(upcoming, v, 30, { due: '2027-02-01' });
            const old = await newVendor(past, { total: 500 });
            await pay(past, old, 40, { due: '2026-07-01' });
            const amounts = async (filter) =>
                (await m.findPlannerPaymentsDue(userId, { filter, today: TODAY }))
                    .map((d) => d.amount)
                    .sort((x, y) => x - y);

            assert.deepEqual(await amounts('month'), [10, 30, 40]);
            assert.deepEqual(await amounts('next30'), [10, 20, 30, 40]);
            assert.deepEqual(await amounts('overdue'), [30, 40]);
            assert.equal(await m.countPlannerOverdue(userId, TODAY), 2);
        });

        it("createPayment refuses another wedding's vendor", async () => {
            const mine = await newWedding('Mine');
            const theirs = await newWedding('Theirs');
            const theirVendor = await newVendor(theirs);
            const created = await m.createPayment(theirVendor, mine, {
                label: null,
                amount: 100,
                dueDate: null,
                paidOn: null,
                note: null
            });
            assert.equal(created, null);
            const { rowCount } = await app.pool.query('SELECT 1 FROM vendor_payments WHERE vendor_id = $1;', [
                theirVendor
            ]);
            assert.equal(rowCount, 0);
        });
    });

    describe('vendor page', () => {
        const PASSWORD = 'correct horse battery';
        const tokenIn = (body) => body.match(/\/invite\/([0-9a-f-]{36})/)?.[1];
        let planner;
        let client;
        let viewer;
        let weddingId;
        let vendorId;

        const paymentsOf = async (id) =>
            (
                await app.pool.query(
                    'SELECT label, amount::float AS amount, paid_on::text AS paid_on FROM vendor_payments WHERE vendor_id = $1 ORDER BY created_at;',
                    [id]
                )
            ).rows;
        const contractOf = async (id) =>
            (
                await app.pool.query(
                    `SELECT contract_total::float AS total, contract_url AS url, contract_includes AS includes
                     FROM vendors WHERE id = $1;`,
                    [id]
                )
            ).rows[0];
        const emptyContract = {
            contract_total: '',
            contract_signed_on: '',
            contract_url: '',
            contract_includes: '',
            contract_cancellation: ''
        };

        before(async () => {
            planner = new TestClient(app.baseUrl);
            await planner.get('/register?as=planner');
            await planner.post('/register', {
                as: 'planner',
                name: 'Pia',
                email: 'pia@example.com',
                password: PASSWORD,
                confirm_password: PASSWORD
            });
            await planner.get('/planner');
            await planner.post('/planner/weddings', { name: 'Rosa & Tom', wedding_date: '' });
            weddingId = (await app.pool.query(`SELECT id FROM weddings WHERE name = 'Rosa & Tom';`)).rows[0].id;
            await planner.get('/settings');
            await planner.post('/settings/invites', { email: '', role: 'client' });
            const clientToken = tokenIn((await planner.get('/settings')).body);
            await planner.post('/settings/invites', { email: '', role: 'viewer' });
            const tokens = [...(await planner.get('/settings')).body.matchAll(/\/invite\/([0-9a-f-]{36})/g)].map(
                (match) => match[1]
            );
            const viewerToken = tokens.find((t) => t !== clientToken);
            client = await registeredClient(app.baseUrl, 'Rosa', 'rosa@example.com');
            await client.get(`/invite/${clientToken}`);
            await client.post(`/invite/${clientToken}/accept`);
            viewer = await registeredClient(app.baseUrl, 'Val', 'val@example.com');
            await viewer.get(`/invite/${viewerToken}`);
            await viewer.post(`/invite/${viewerToken}/accept`);

            await planner.get('/vendors');
            await planner.post('/vendors', {
                name: 'Bloom & Blossom',
                category: 'Florist',
                status: 'Booked',
                phone: '',
                email: '',
                website: '',
                notes: ''
            });
            vendorId = (await app.pool.query(`SELECT id FROM vendors WHERE name = 'Bloom & Blossom';`)).rows[0].id;
        });

        it('contract saves, shows and clears', async () => {
            await planner.get(`/vendors/${vendorId}/contract`);
            const saved = await planner.post(`/vendors/${vendorId}/contract`, {
                ...emptyContract,
                contract_total: '$4,800',
                contract_signed_on: '2027-03-12',
                contract_url: 'https://drive.example/c.pdf',
                contract_includes: 'Arch and 12 centrepieces'
            });
            assert.equal(saved.location, `/vendors/${vendorId}`);
            const page = await client.get(`/vendors/${vendorId}`);
            assert.equal(page.status, 200);
            assert.match(page.body, /\$4,800\.00/);
            assert.match(page.body, /Arch and 12 centrepieces/);
            assert.match(
                page.body,
                /href="https:\/\/drive\.example\/c\.pdf" target="_blank" rel="noopener noreferrer"/
            );

            await planner.get(`/vendors/${vendorId}/contract`);
            await planner.post(`/vendors/${vendorId}/contract`, emptyContract);
            assert.deepEqual(await contractOf(vendorId), { total: null, url: null, includes: null });
            assert.match((await planner.get(`/vendors/${vendorId}`)).body, /Add contract details/);
        });

        it('invalid contract re-renders with 400 and keeps the input escaped', async () => {
            await planner.get(`/vendors/${vendorId}/contract`);
            const bad = await planner.post(`/vendors/${vendorId}/contract`, {
                ...emptyContract,
                contract_total: '900',
                contract_url: 'javascript:alert("x")'
            });
            assert.equal(bad.status, 400);
            assert.match(bad.body, /value="javascript:alert\(&#34;x&#34;\)"/);
            assert.equal((await contractOf(vendorId)).total, null);
        });

        it('add, pay, unpay, edit and delete a payment', async () => {
            await planner.get(`/vendors/${vendorId}`);
            const added = await planner.post(`/vendors/${vendorId}/payments`, {
                label: 'Deposit',
                amount: '$1,200',
                due_date: '2027-03-12',
                paid_on: '',
                note: ''
            });
            assert.equal(added.location, `/vendors/${vendorId}`);
            assert.match((await planner.get(`/vendors/${vendorId}`)).body, /Deposit/);
            const paymentId = (await app.pool.query('SELECT id FROM vendor_payments WHERE vendor_id = $1;', [vendorId]))
                .rows[0].id;

            await client.get(`/vendors/${vendorId}`);
            await client.post(`/payments/${paymentId}/paid`, { paid: '1' });
            assert.deepEqual(await paymentsOf(vendorId), [{ label: 'Deposit', amount: 1200, paid_on: todayIso() }]);
            await client.post(`/payments/${paymentId}/paid`, { paid: '0' });
            assert.equal((await paymentsOf(vendorId))[0].paid_on, null);

            await planner.get(`/payments/${paymentId}/edit`);
            await planner.post(`/payments/${paymentId}/edit`, {
                label: 'Deposit',
                amount: '1200',
                due_date: '2027-03-12',
                paid_on: '2027-03-01',
                note: ''
            });
            assert.equal((await paymentsOf(vendorId))[0].paid_on, '2027-03-01');

            await planner.get(`/vendors/${vendorId}`);
            const deleted = await planner.post(`/payments/${paymentId}/delete`);
            assert.equal(deleted.location, `/vendors/${vendorId}`);
            assert.deepEqual(await paymentsOf(vendorId), []);
        });

        it('bad payment amount keeps the input', async () => {
            await planner.get(`/vendors/${vendorId}`);
            const bad = await planner.post(`/vendors/${vendorId}/payments`, {
                label: '',
                amount: 'abc',
                due_date: '',
                paid_on: '',
                note: ''
            });
            assert.equal(bad.status, 400);
            assert.match(bad.body, /value="abc"/);
            assert.deepEqual(await paymentsOf(vendorId), []);
        });

        it('the vendor page shows owed, unscheduled and overdue', async () => {
            await app.pool.query('UPDATE vendors SET contract_total = 4800 WHERE id = $1;', [vendorId]);
            await pay(weddingId, vendorId, 1200, { due: '2027-01-01', paid: '2027-01-01' });
            await pay(weddingId, vendorId, 1800, { due: '2020-01-01' });
            const page = (await planner.get(`/vendors/${vendorId}`)).body;
            assert.match(page, /Still owed \$3,600\.00/);
            assert.match(page, /\$1,800\.00 not yet scheduled/);
            assert.match(page, /overdue/);

            await pay(weddingId, vendorId, 2100, {});
            assert.match((await planner.get(`/vendors/${vendorId}`)).body, /\$300\.00 more than the contract total/);
            await app.pool.query('DELETE FROM vendor_payments WHERE vendor_id = $1 AND amount = 2100;', [vendorId]);
        });

        it('the vendor list shows the money line, and a quote for unbooked vendors', async () => {
            await planner.get('/vendors');
            await planner.post('/vendors', {
                name: 'Lens & Light',
                category: 'Photographer',
                status: 'Researching',
                phone: '',
                email: '',
                website: '',
                notes: ''
            });
            await app.pool.query(`UPDATE vendors SET contract_total = 3000 WHERE name = 'Lens & Light';`);
            const list = (await planner.get('/vendors')).body;
            assert.match(list, /href="\/vendors\/[0-9a-f-]{36}"/);
            assert.match(list, /Contract \$4,800\.00 · \$3,600\.00 owed/);
            assert.match(list, /Quote \$3,000\.00/);
        });

        it('viewers see but cannot change', async () => {
            const page = await viewer.get(`/vendors/${vendorId}`);
            assert.equal(page.status, 200);
            assert.doesNotMatch(page.body, /action="\/vendors\/[0-9a-f-]{36}\/payments"/);
            assert.doesNotMatch(page.body, /\/paid"/);
            const before = (await paymentsOf(vendorId)).length;
            const refused = await viewer.post(`/vendors/${vendorId}/payments`, { amount: '50' });
            assert.notEqual(refused.status, 200);
            assert.equal((await paymentsOf(vendorId)).length, before);
        });

        it("another wedding's vendor or payment is out of reach", async () => {
            const other = await registeredClient(app.baseUrl, 'Otto', 'otto@example.com');
            await other.get('/vendors');
            await other.post('/vendors', {
                name: 'Other Florist',
                category: 'Florist',
                status: 'Booked',
                phone: '',
                email: '',
                website: '',
                notes: ''
            });
            const { rows } = await app.pool.query(`SELECT id, wedding_id FROM vendors WHERE name = 'Other Florist';`);
            const theirVendor = rows[0].id;
            await pay(rows[0].wedding_id, theirVendor, 700, { due: '2027-05-01' });
            const theirPayment = (
                await app.pool.query('SELECT id FROM vendor_payments WHERE vendor_id = $1;', [theirVendor])
            ).rows[0].id;

            await planner.get('/vendors');
            const attempts = [
                planner.get(`/vendors/${theirVendor}`),
                planner.post(`/vendors/${theirVendor}/contract`, { ...emptyContract, contract_total: '1' }),
                planner.post(`/vendors/${theirVendor}/payments`, { amount: '1' }),
                planner.post(`/payments/${theirPayment}/paid`, { paid: '1' }),
                planner.post(`/payments/${theirPayment}/edit`, { amount: '1' }),
                planner.post(`/payments/${theirPayment}/delete`)
            ];
            for (const response of await Promise.all(attempts)) assert.equal(response.status, 404);
            assert.deepEqual(await paymentsOf(theirVendor), [{ label: null, amount: 700, paid_on: null }]);
            assert.equal((await contractOf(theirVendor)).total, null);
        });

        it('deleting a vendor removes its payments, and the confirmation says so', async () => {
            const list = (await planner.get('/vendors')).body;
            assert.match(list, /data-confirm="[^"]*2 payments/);
            await planner.post(`/vendors/${vendorId}/delete`);
            assert.deepEqual(await paymentsOf(vendorId), []);
        });
    });

    describe('budget', () => {
        const textOf = (html) =>
            html
                .replace(/<[^>]+>/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\s+/g, ' ');
        let couple;
        let weddingId;
        let florist;

        before(async () => {
            couple = await registeredClient(app.baseUrl, 'Bea', 'bea@example.com');
            weddingId = (
                await app.pool.query(
                    `SELECT wm.wedding_id FROM wedding_members wm JOIN users u ON u.id = wm.user_id WHERE u.email = 'bea@example.com';`
                )
            ).rows[0].wedding_id;
        });

        it('empty wedding shows zeros', async () => {
            const budget = textOf((await couple.get('/budget')).body);
            assert.match(budget, /Committed \$0\.00/);
            assert.match(budget, /Paid \$0\.00/);
            assert.match(budget, /Still owed \$0\.00/);
            const dashboard = (await couple.get('/')).body;
            assert.doesNotMatch(dashboard, /NaN/);
            assert.doesNotMatch(dashboard, /Payments due/);
        });

        it('budget shows committed, paid and still owed', async () => {
            florist = await newVendor(weddingId, { name: 'Bloom & Blossom', category: 'Florist', total: 4800 });
            await pay(weddingId, florist, 1200, { paid: '2027-01-01' });
            await app.pool.query(
                `INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Dress alterations', 'Attire', 450);
                 INSERT INTO budget_limits (wedding_id, total) VALUES ($1, 32000);`.replaceAll('$1', `'${weddingId}'`)
            );
            const html = (await couple.get('/budget')).body;
            const budget = textOf(html);
            assert.match(budget, /Committed \$5,250\.00/);
            assert.match(budget, /Paid \$1,650\.00/);
            assert.match(budget, /Still owed \$3,600\.00/);
            assert.match(budget, /Vendor contracts/);
            assert.match(html, new RegExp(`href="/vendors/${florist}"`));
        });

        it('category totals include booked contracts', async () => {
            const budget = textOf((await couple.get('/budget')).body);
            assert.match(budget, /Flowers \$4,800\.00/);
        });

        it('warns about expenses that may duplicate a contract', async () => {
            assert.doesNotMatch(textOf((await couple.get('/budget')).body), /may duplicate/);
            await app.pool.query(
                `INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Bloom & Blossom deposit', 'Flowers', 1200);`,
                [weddingId]
            );
            assert.match(textOf((await couple.get('/budget')).body), /may duplicate/);
            await app.pool.query(`DELETE FROM budget_items WHERE name = 'Bloom & Blossom deposit';`);
            await app.pool.query(
                `INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Buttonholes', 'Flowers', 80);`,
                [weddingId]
            );
            assert.doesNotMatch(textOf((await couple.get('/budget')).body), /may duplicate/);
            await app.pool.query(
                `INSERT INTO budget_items (wedding_id, name, category, amount) VALUES ($1, 'Flowers', 'Flowers', 4800);`,
                [weddingId]
            );
            assert.match(textOf((await couple.get('/budget')).body), /may duplicate/);
            await app.pool.query(`DELETE FROM budget_items WHERE name IN ('Buttonholes', 'Flowers');`);
        });

        it('over budget uses committed', async () => {
            await app.pool.query('UPDATE budget_limits SET total = 4000 WHERE wedding_id = $1;', [weddingId]);
            assert.match((await couple.get('/budget')).body, /notice--error/);
            await app.pool.query('UPDATE budget_limits SET total = 32000 WHERE wedding_id = $1;', [weddingId]);
        });

        it('the dashboard budget stat uses committed', async () => {
            assert.match(textOf((await couple.get('/')).body), /\$5,250\.00 committed of \$32,000\.00/);
        });

        it('the planner card uses committed', async () => {
            const { rows } = await app.pool.query(`SELECT id FROM users WHERE email = 'pia@example.com';`);
            await app.pool.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'viewer');`, [
                weddingId,
                rows[0].id
            ]);
            const planner = new TestClient(app.baseUrl);
            await planner.get('/login');
            await planner.post('/login', { email: 'pia@example.com', password: 'correct horse battery' });
            const page = textOf((await planner.get('/planner?when=all')).body);
            assert.match(page, /\$5,250\.00 of \$32,000\.00/);
        });
    });

    describe('payments due', () => {
        const textOf = (html) =>
            html
                .replace(/<[^>]+>/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\s+/g, ' ');
        const shift = (days) => {
            const date = new Date(`${todayIso()}T12:00:00Z`);
            date.setUTCDate(date.getUTCDate() + days);
            return date.toISOString().slice(0, 10);
        };
        let planner;
        let plannerId;
        let ana;
        let mia;
        let anaVendor;

        before(async () => {
            planner = new TestClient(app.baseUrl);
            await planner.get('/register?as=planner');
            await planner.post('/register', {
                as: 'planner',
                name: 'Dora',
                email: 'dora@example.com',
                password: 'correct horse battery',
                confirm_password: 'correct horse battery'
            });
            await planner.get('/planner');
            await planner.post('/planner/weddings', { name: 'Ana & Luis', wedding_date: '' });
            await planner.post('/planner/weddings', { name: 'Mia & Theo', wedding_date: '' });
            plannerId = (await app.pool.query(`SELECT id FROM users WHERE email = 'dora@example.com';`)).rows[0].id;
            ana = (await app.pool.query(`SELECT id FROM weddings WHERE name = 'Ana & Luis';`)).rows[0].id;
            mia = (await app.pool.query(`SELECT id FROM weddings WHERE name = 'Mia & Theo';`)).rows[0].id;
            anaVendor = await newVendor(ana, { name: 'Golden Hour', total: 3000 });
            await pay(ana, anaVendor, 300, { due: shift(-5) });
            await pay(ana, anaVendor, 200, { due: shift(10) });
            await pay(ana, anaVendor, 100, { due: shift(40) });
            const unbooked = await newVendor(ana, { name: 'Maybe Band', status: 'Contacted', total: 900 });
            await pay(ana, unbooked, 900, { due: shift(3) });
            const miaVendor = await newVendor(mia, { name: 'Sweet Cakes', category: 'Cake', total: 800 });
            await pay(mia, miaVendor, 80, { due: shift(-1) });
            await pay(mia, miaVendor, 60, { due: shift(20) });
        });

        it('wedding dashboard lists overdue then upcoming payments', async () => {
            await planner.post(`/planner/weddings/${ana}/open`);
            const page = (await planner.get('/')).body;
            const text = textOf(page);
            assert.match(text, /Payments due/);
            const overdueAt = text.indexOf('$300.00');
            const upcomingAt = text.indexOf('$200.00');
            assert.ok(overdueAt > 0 && upcomingAt > overdueAt, 'overdue first');
            assert.doesNotMatch(text, /\$100\.00/, 'beyond 30 days');
            assert.match(text, /\$300\.00[^$]*overdue/);
            assert.match(page, new RegExp(`href="/vendors/${anaVendor}"`));
        });

        it("unbooked vendors' payments are not due", async () => {
            assert.doesNotMatch(textOf((await planner.get('/')).body), /Maybe Band/);
        });

        it('planner sees payments due across weddings with filters', async () => {
            const month = textOf((await planner.get('/planner')).body);
            assert.match(month, /Payments due/);
            assert.match(month, /Ana & Luis/);
            assert.match(month, /\$300\.00/);
            assert.match(month, /\$80\.00/);
            assert.doesNotMatch(month, /\$100\.00/);

            const overdue = textOf((await planner.get('/planner?pay=overdue')).body);
            assert.match(overdue, /\$300\.00/);
            assert.match(overdue, /\$80\.00/);
            assert.doesNotMatch(overdue, /\$200\.00/);
            assert.doesNotMatch(overdue, /\$60\.00/);

            const next30 = textOf((await planner.get('/planner?pay=next30')).body);
            for (const amount of ['$300.00', '$200.00', '$80.00', '$60.00']) assert.ok(next30.includes(amount), amount);
            assert.doesNotMatch(next30, /\$100\.00/);

            assert.equal(textOf((await planner.get('/planner?pay=bogus')).body), month);
        });

        it('workload counts overdue payments', async () => {
            assert.match(textOf((await planner.get('/planner')).body), /2 payments overdue/);
        });

        it('opening a payment row goes to the vendor in that wedding', async () => {
            await planner.post(`/planner/weddings/${mia}/open`);
            const opened = await planner.post(`/planner/weddings/${ana}/open`, { return_to: `/vendors/${anaVendor}` });
            assert.equal(opened.location, `/vendors/${anaVendor}`);
            assert.equal((await planner.get(`/vendors/${anaVendor}`)).status, 200);
            const evil = await planner.post(`/planner/weddings/${ana}/open`, {
                return_to: 'https://evil.com/vendors/x'
            });
            assert.equal(evil.location, '/');
            const other = await planner.post(`/planner/weddings/${ana}/open`, { return_to: '/settings' });
            assert.equal(other.location, '/');
            assert.ok(plannerId);
        });
    });
});
