import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { hashPassword, needsRehash, verifyPassword } from '../../src/utils/password.js';
import { isLocalPath, isSafeReturnPath } from '../../src/utils/session.js';
import { daysUntil, formatCurrency, formatDate, toIsoDate } from '../../src/utils/format.js';
import { emphasize, fieldState } from '../../src/utils/view-helpers.js';
import { escapeHtml } from '../../src/services/email.js';
import { nextInCycle, RSVP_STATUSES } from '../../src/constants.js';

describe('password hashing', () => {
    it('round-trips scrypt hashes and salts each one', async () => {
        const a = await hashPassword('correct horse');
        const b = await hashPassword('correct horse');
        assert.notEqual(a, b);
        assert.ok(await verifyPassword('correct horse', a));
        assert.ok(!(await verifyPassword('wrong horse', a)));
        assert.ok(!needsRehash(a));
    });

    it('still verifies legacy bcrypt hashes and flags them for rehashing', async () => {
        const legacy = await bcrypt.hash('old password', 4);
        assert.ok(needsRehash(legacy));
        assert.ok(await verifyPassword('old password', legacy));
        assert.ok(!(await verifyPassword('other', legacy)));
    });

    it('rejects missing or malformed hashes without throwing', async () => {
        assert.ok(!(await verifyPassword('x', null)));
        assert.ok(!(await verifyPassword('x', 'garbage')));
    });
});

describe('redirect safety', () => {
    it('only allows same-site paths', () => {
        assert.ok(isLocalPath('/guests?rsvp=Pending'));
        assert.ok(!isLocalPath('//evil.example'));
        assert.ok(!isLocalPath('/\\evil.example'));
        assert.ok(!isLocalPath('https://evil.example'));
        assert.ok(!isLocalPath(['/x']));
    });

    it('never returns to the auth pages after login', () => {
        assert.ok(isSafeReturnPath('/invite/abc'));
        assert.ok(!isSafeReturnPath('/login'));
        assert.ok(!isSafeReturnPath('/logout'));
    });
});

describe('formatting', () => {
    it('formats DATE values without timezone shifts', () => {
        const june13 = new Date(2026, 5, 13); // how pg returns a DATE: local midnight
        assert.equal(toIsoDate(june13), '2026-06-13');
        assert.equal(formatDate(june13, 'en'), 'Saturday, June 13, 2026');
        assert.match(formatDate('2026-06-13', 'es'), /13 de junio de 2026/);
        assert.equal(formatDate(null, 'en'), '');
    });

    it('counts days until a date', () => {
        const today = new Date(2026, 5, 1, 23, 59);
        assert.equal(daysUntil('2026-06-13', today), 12);
        assert.equal(daysUntil('2026-06-01', today), 0);
        assert.equal(daysUntil('2026-05-31', today), -1);
        assert.equal(daysUntil(null, today), null);
    });

    it('formats currency from pg NUMERIC strings', () => {
        assert.equal(formatCurrency('1250.5', 'en'), '$1,250.50');
    });
});

describe('view helpers', () => {
    it('emphasize escapes before adding <em>', () => {
        assert.equal(emphasize('*Our* <b>day</b>'), '<em>Our</em> &lt;b&gt;day&lt;/b&gt;');
    });

    it('fieldState marks only fields with errors and merges hint ids', () => {
        const errors = [{ field: 'email', key: 'validation.email' }];
        assert.equal(fieldState(errors, 'email'), 'aria-invalid="true" aria-describedby="form-errors"');
        assert.equal(fieldState(errors, 'name'), '');
        assert.equal(fieldState([], 'password', 'form-errors', 'hint'), 'aria-describedby="hint"');
    });

    it('email escaping covers attribute-breaking characters', () => {
        assert.equal(escapeHtml(`"><img src=x onerror='a'>&`), '&quot;&gt;&lt;img src=x onerror=&#39;a&#39;&gt;&amp;');
    });
});

describe('constants', () => {
    it('nextInCycle wraps around', () => {
        assert.equal(nextInCycle(RSVP_STATUSES, 'Pending'), 'Confirmed');
        assert.equal(nextInCycle(RSVP_STATUSES, 'Declined'), 'Pending');
    });
});
