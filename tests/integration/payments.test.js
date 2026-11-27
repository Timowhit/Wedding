import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutDb, startTestApp } from '../helpers/app.js';

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
});
