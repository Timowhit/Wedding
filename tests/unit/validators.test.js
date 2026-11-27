import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEmail, isHttpUrl, isUuid, isValidDate, parseMoney, readText } from '../../src/validators/common.js';
import {
    validateLogin,
    validatePasswordChange,
    validateProfile,
    validateRegistration
} from '../../src/validators/auth.js';
import { extractInviteToken, validateInvite, validateWedding } from '../../src/validators/weddings.js';
import { validateContract, validatePayment } from '../../src/validators/payments.js';
import {
    validateExpense,
    validateGuest,
    validateSearch,
    validateTask,
    validateVendor
} from '../../src/validators/planning.js';

const fields = (result) => result.errors.map((error) => error.field);

describe('common helpers', () => {
    it('readText trims strings and treats everything else as empty', () => {
        assert.equal(readText('  hi  '), 'hi');
        assert.equal(readText(['a', 'b']), '');
        assert.equal(readText(undefined), '');
        assert.equal(readText({ toString: () => 'x' }), '');
    });

    it('isValidDate accepts only real calendar dates in range', () => {
        assert.ok(isValidDate('2026-06-13'));
        assert.ok(isValidDate('2028-02-29'));
        assert.ok(!isValidDate('2026-02-30'));
        assert.ok(!isValidDate('2026-6-13'));
        assert.ok(!isValidDate('1899-12-31'));
        assert.ok(!isValidDate('2101-01-01'));
    });

    it('isHttpUrl rejects non-http schemes', () => {
        assert.ok(isHttpUrl('https://florist.example/contact'));
        assert.ok(isHttpUrl('http://florist.example'));
        assert.ok(!isHttpUrl('javascript:alert(1)'));
        assert.ok(!isHttpUrl('data:text/html,hi'));
        assert.ok(!isHttpUrl('florist.example'));
        assert.ok(!isHttpUrl(`https://a.example/${'x'.repeat(600)}`));
    });

    it('parseMoney accepts common formats and rejects the rest', () => {
        assert.equal(parseMoney('1250'), 1250);
        assert.equal(parseMoney('$1,250.50'), 1250.5);
        assert.equal(parseMoney('0'), 0);
        assert.equal(parseMoney('-5'), null);
        assert.equal(parseMoney('1.234'), null);
        assert.equal(parseMoney('abc'), null);
        assert.equal(parseMoney('99999999999'), null);
    });

    it('isUuid and isEmail', () => {
        assert.ok(isUuid('4b9c8c2e-3f1a-4d2b-9c8e-1a2b3c4d5e6f'));
        assert.ok(!isUuid('1'));
        assert.ok(!isUuid("4b9c8c2e-3f1a-4d2b-9c8e-1a2b3c4d5e6f' OR 1=1"));
        assert.ok(isEmail('a@b.co'));
        assert.ok(!isEmail('a@b'));
    });
});

describe('auth validators', () => {
    it('validateRegistration checks every field and never trims passwords', () => {
        const ok = validateRegistration({
            name: ' Ana ',
            email: ' ANA@Example.COM ',
            password: ' secret12 ',
            confirm_password: ' secret12 '
        });
        assert.deepEqual(ok.errors, []);
        assert.deepEqual(ok.values, { name: 'Ana', email: 'ana@example.com', business_name: '' });

        const longBusiness = validateRegistration({
            name: 'Ana',
            email: 'ana@example.com',
            business_name: 'x'.repeat(121),
            password: 'secret12',
            confirm_password: 'secret12'
        });
        assert.deepEqual(fields(longBusiness), ['business_name']);
        assert.equal(ok.password, ' secret12 ');

        const bad = validateRegistration({ name: '', email: 'nope', password: 'short', confirm_password: 'other' });
        assert.deepEqual(fields(bad), ['name', 'email', 'password', 'confirm_password']);
    });

    it('validateLogin requires both fields', () => {
        assert.deepEqual(fields(validateLogin({})), ['email', 'password']);
        assert.deepEqual(validateLogin({ email: 'A@B.CO', password: 'x' }).values, { email: 'a@b.co' });
    });

    it('validateProfile only accepts supported languages', () => {
        assert.deepEqual(fields(validateProfile({ display_name: 'Ana', language: 'fr' })), ['language']);
        assert.deepEqual(validateProfile({ display_name: 'Ana', language: 'es' }).errors, []);
    });

    it('validatePasswordChange skips the current password for accounts without one', () => {
        const body = { new_password: 'longenough', confirm_password: 'longenough' };
        assert.deepEqual(fields(validatePasswordChange(body, true)), ['current_password']);
        assert.deepEqual(validatePasswordChange(body, false).errors, []);
    });
});

describe('wedding validators', () => {
    it('validateWedding requires a name and allows an empty date', () => {
        assert.deepEqual(validateWedding({ name: 'Our Day', wedding_date: '' }).data, {
            name: 'Our Day',
            weddingDate: null
        });
        assert.deepEqual(fields(validateWedding({ name: '', wedding_date: '2026-13-01' })), ['name', 'wedding_date']);
    });

    it('validateInvite never allows the owner role', () => {
        assert.deepEqual(fields(validateInvite({ email: '', role: 'owner' })), ['role']);
        assert.deepEqual(validateInvite({ email: '', role: 'viewer' }).data, { email: null, role: 'viewer' });
        assert.deepEqual(fields(validateInvite({ email: 'bad', role: 'editor' })), ['email']);
    });

    it('extractInviteToken finds the token in links and bare tokens', () => {
        const token = '4b9c8c2e-3f1a-4d2b-9c8e-1a2b3c4d5e6f';
        assert.equal(extractInviteToken(`https://planner.example/invite/${token}`), token);
        assert.equal(extractInviteToken(`https://old.example/invite.html?token=${token.toUpperCase()}`), token);
        assert.equal(extractInviteToken(token), token);
        assert.equal(extractInviteToken('https://planner.example/invite/nope'), null);
        assert.equal(extractInviteToken(['x']), null);
    });
});

describe('planning validators', () => {
    it('validateExpense requires a positive amount and a known category', () => {
        assert.deepEqual(validateExpense({ name: 'Cake', category: 'Catering', amount: '$300' }).data, {
            name: 'Cake',
            category: 'Catering',
            amount: 300
        });
        assert.deepEqual(fields(validateExpense({ name: '', category: 'Bribes', amount: '0' })), [
            'name',
            'category',
            'amount'
        ]);
    });

    it('validateTask turns an empty due date into null', () => {
        assert.equal(validateTask({ text: 'Book DJ', category: 'Other', due_date: '' }).data.dueDate, null);
        assert.deepEqual(fields(validateTask({ text: 'x', category: 'Other', due_date: 'tomorrow' })), ['due_date']);
    });

    it('validateGuest stores empty optional fields as null', () => {
        const result = validateGuest({ name: 'Ana', rsvp: 'Pending', diet: ' ', plus_one: '' });
        assert.deepEqual(result.data, { name: 'Ana', rsvp: 'Pending', diet: null, plusOne: null, groupName: null });
        assert.deepEqual(fields(validateGuest({ name: 'Ana', rsvp: 'Maybe' })), ['rsvp']);
    });

    it('validateVendor rejects unsafe websites and bad emails', () => {
        const base = { name: 'Bloom', category: 'Florist', status: 'Booked' };
        assert.deepEqual(validateVendor({ ...base, website: 'https://bloom.example' }).errors, []);
        assert.deepEqual(fields(validateVendor({ ...base, website: 'javascript:alert(1)' })), ['website']);
        assert.deepEqual(fields(validateVendor({ ...base, email: 'not-an-email' })), ['email']);
        assert.deepEqual(fields(validateVendor({ ...base, status: 'Paid' })), ['status']);
    });

    it('validateSearch limits the query length', () => {
        assert.equal(validateSearch(' roses ').query, 'roses');
        const long = validateSearch('x'.repeat(101));
        assert.equal(long.query, '');
        assert.deepEqual(fields(long), ['q']);
    });
});

describe('validateContract', () => {
    const empty = {
        contract_total: '',
        contract_signed_on: '',
        contract_url: '',
        contract_includes: '',
        contract_cancellation: ''
    };

    it('accepts an all-empty contract as "no contract"', () => {
        const { data, errors } = validateContract(empty);
        assert.deepEqual(errors, []);
        assert.deepEqual(data, { total: null, signedOn: null, url: null, includes: null, cancellation: null });
    });

    it('reads money with symbols and keeps the text fields', () => {
        const { data, errors } = validateContract({
            ...empty,
            contract_total: '$4,800',
            contract_signed_on: '2027-03-12',
            contract_url: 'https://drive.example/c.pdf',
            contract_includes: '12 centrepieces'
        });
        assert.deepEqual(errors, []);
        assert.equal(data.total, 4800);
        assert.equal(data.signedOn, '2027-03-12');
        assert.equal(data.url, 'https://drive.example/c.pdf');
        assert.equal(data.includes, '12 centrepieces');
    });

    it('only takes https links of a sane length', () => {
        for (const url of [
            'http://x.com/c.pdf',
            'javascript:alert(1)',
            'not a link',
            `https://x.com/${'a'.repeat(2000)}`
        ]) {
            const { errors } = validateContract({ ...empty, contract_url: url });
            assert.deepEqual(errors, [{ field: 'contract_url', key: 'validation.httpsUrl' }], url);
        }
    });

    it('rejects a bad date, a negative total and over-long text', () => {
        const { errors } = validateContract({
            ...empty,
            contract_total: '-5',
            contract_signed_on: '2027-02-30',
            contract_includes: 'x'.repeat(2001),
            contract_cancellation: 'x'.repeat(1001)
        });
        assert.deepEqual(
            errors.map((e) => [e.field, e.key]),
            [
                ['contract_total', 'validation.amount'],
                ['contract_signed_on', 'validation.date'],
                ['contract_includes', 'validation.tooLong'],
                ['contract_cancellation', 'validation.tooLong']
            ]
        );
    });
});

describe('validatePayment', () => {
    const base = { label: '', amount: '100', due_date: '', paid_on: '', note: '' };

    it('needs an amount greater than 0', () => {
        for (const amount of ['', '0', '-5', 'abc', '1,200.555']) {
            const { errors } = validatePayment({ ...base, amount });
            assert.deepEqual(errors, [{ field: 'amount', key: 'validation.positiveAmount' }], amount);
        }
    });

    it('accepts "$1,200" and treats empty optional fields as null', () => {
        const { data, errors } = validatePayment({ ...base, amount: '$1,200' });
        assert.deepEqual(errors, []);
        assert.deepEqual(data, { label: null, amount: 1200, dueDate: null, paidOn: null, note: null });
    });

    it('checks dates and lengths', () => {
        const { errors } = validatePayment({
            ...base,
            label: 'x'.repeat(121),
            due_date: 'soon',
            paid_on: '2027-13-01',
            note: 'x'.repeat(501)
        });
        assert.deepEqual(
            errors.map((e) => [e.field, e.key]),
            [
                ['label', 'validation.tooLong'],
                ['due_date', 'validation.date'],
                ['paid_on', 'validation.date'],
                ['note', 'validation.tooLong']
            ]
        );
    });
});
