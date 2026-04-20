/**
 * @file routes/budget.js
 */

"use strict";

const { Router } = require("express");
const { body, query, param } = require("express-validator");

const ctrl = require("../controllers/budgetController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");

const router = Router();

const CATEGORIES = [
  "Venue",
  "Catering",
  "Photography",
  "Flowers",
  "Music",
  "Attire",
  "Invitations",
  "Transportation",
  "Honeymoon",
  "Other",
];

// All budget routes require auth
router.use(authenticate);

/* ── Summary ────────────────────────────────────────────────── */
router.get("/summary", ctrl.getSummary);

/* ── Budget limit ───────────────────────────────────────────── */
router.put(
  "/limit",
  body("total")
    .isFloat({ min: 0 })
    .withMessage("Total must be a non-negative number"),
  validate,
  ctrl.setLimit,
);

/* ── Expense items ──────────────────────────────────────────── */
router.get(
  "/",
  query("category").optional().isIn(CATEGORIES),
  validate,
  ctrl.listItems,
);

router.post(
  "/",
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ max: 200 }),
  body("category").isIn(CATEGORIES).withMessage("Invalid category"),
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be greater than 0"),
  validate,
  ctrl.createItem,
);

router.delete(
  "/:id",
  param("id").isUUID().withMessage("Invalid item ID"),
  validate,
  ctrl.deleteItem,
);

module.exports = router;
