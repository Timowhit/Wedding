/**
 * @file utils/jwt.js
 * @description Sign and verify JSON Web Tokens.
 */

'use strict';

const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET  || 'dev_secret_change_me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sign a JWT access token for a user.
 * @param {{ id: string, email: string }} payload
 * @returns {string}
 */
const signToken = (payload) =>
  jwt.sign(payload, SECRET, { expiresIn: EXPIRES, algorithm: 'HS256' });

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ id: string, email: string, iat: number, exp: number }}
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
const verifyToken = (token) => jwt.verify(token, SECRET, { algorithms: ['HS256'] });

module.exports = { signToken, verifyToken };
