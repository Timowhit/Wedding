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
