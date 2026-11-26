import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

// scrypt is built into Node, so new hashes need no extra dependency. bcryptjs is kept only to
// verify hashes created by the previous version of the app; those are re-hashed with scrypt on
// the user's next successful login (see controllers/auth.js), so it can be dropped later.
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const LEGACY_BCRYPT_PREFIX = /^\$2[aby]\$/;

/**
 * Hashes a password with scrypt and a random per-password salt.
 * @param {string} password - The plain-text password.
 * @returns {Promise<string>} "<saltHex>:<keyHex>", safe to store in users.password_hash.
 */
const hashPassword = async (password) => {
    const salt = randomBytes(SALT_LENGTH);
    const key = await scryptAsync(password, salt, KEY_LENGTH);
    return `${salt.toString('hex')}:${key.toString('hex')}`;
};

/**
 * True when a stored hash uses the legacy bcrypt format and should be replaced.
 * @param {string|null|undefined} storedHash
 * @returns {boolean}
 */
const needsRehash = (storedHash) => LEGACY_BCRYPT_PREFIX.test(String(storedHash ?? ''));

/**
 * Checks a password against a stored hash in constant time. Accepts scrypt hashes from
 * hashPassword and legacy bcrypt hashes.
 * @param {string} password - The plain-text password to check.
 * @param {string|null|undefined} storedHash - users.password_hash (null for Google-only accounts).
 * @returns {Promise<boolean>} True when the password matches.
 */
const verifyPassword = async (password, storedHash) => {
    if (needsRehash(storedHash)) return bcrypt.compare(password, storedHash);

    const [saltHex, keyHex] = String(storedHash ?? '').split(':');
    if (!saltHex || !keyHex) return false;

    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

// Checked when an email is unknown, so a missing account takes as long to reject as a wrong
// password and response time does not reveal which emails have accounts.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

/** @returns {Promise<string>} A valid scrypt hash that matches no real password. */
const getDummyHash = () => dummyHash;

export { hashPassword, verifyPassword, needsRehash, getDummyHash };
