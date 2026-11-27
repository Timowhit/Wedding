import { createHmac, timingSafeEqual } from 'node:crypto';

/** Kept distinct from any other use of the secret, so a token can only ever unsubscribe. */
const PURPOSE = 'unsubscribe:';

const sign = (userId) =>
    createHmac('sha256', process.env.SESSION_SECRET ?? '')
        .update(PURPOSE + userId)
        .digest('hex');

/**
 * The token in a person's unsubscribe link. Signed with SESSION_SECRET, so it works without
 * signing in and can't be made up for someone else.
 * @param {string} userId
 * @returns {string} 64 hex characters.
 */
const unsubscribeToken = (userId) => sign(userId);

/**
 * @param {string} userId
 * @param {unknown} token - From the link.
 * @returns {boolean} True only for that person's own token (compared in constant time).
 */
const isUnsubscribeToken = (userId, token) => {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
    return timingSafeEqual(Buffer.from(sign(userId), 'hex'), Buffer.from(token, 'hex'));
};

export { unsubscribeToken, isUnsubscribeToken };
