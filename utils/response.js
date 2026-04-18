/**
 * @file utils/response.js
 * @description Centralised JSON response helpers.
 * All controller responses should go through these helpers
 * to ensure a consistent envelope shape.
 *
 * Success envelope:
 *   { success: true,  data: <payload>, meta?: { page, limit, total } }
 *
 * Error envelope (produced by errorHandler middleware):
 *   { success: false, message: string, errors?: [] }
 */

'use strict';

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {*}      data        Response payload
 * @param {number} [status=200]
 * @param {object} [meta]      Optional pagination / extra metadata
 */
const sendSuccess = (res, data, status = 200, meta = undefined) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  res.status(status).json(body);
};

/**
 * Send a 201 Created response with a resource payload.
 * @param {import('express').Response} res
 * @param {*} data
 */
const sendCreated = (res, data) => sendSuccess(res, data, 201);

/**
 * Send a 204 No Content response (e.g. after DELETE).
 * @param {import('express').Response} res
 */
const sendNoContent = (res) => res.status(204).end();

/**
 * Build pagination meta from query params and total count.
 * @param {number} page    1-based page number
 * @param {number} limit   Items per page
 * @param {number} total   Total matching rows
 * @returns {{ page: number, limit: number, total: number, pages: number }}
 */
const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit) || 1,
});

module.exports = { sendSuccess, sendCreated, sendNoContent, paginationMeta };
