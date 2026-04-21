/**
 * @file middleware/validate.js
 * @description Reads express-validator results and short-circuits
 * the request with a 422 if any validation rule failed.
 *
 * Usage:
 *   router.post('/path', [...validationChain], validate, controller);
 */

"use strict";

const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

/**
 * Express middleware that checks for validation errors.
 * Call this AFTER your express-validator chain(s).
 */
const validate = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map(({ path, msg }) => ({ field: path, msg }));
  return next(new ApiError.unprocessable("Validation failed", errors));
};

module.exports = validate;
