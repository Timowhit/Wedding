/**
 * @file routes/guests.js
 */

"use strict";

const { Router } = require("express");
const { body, param, query } = require("express-validator");

const ctrl = require("../controllers/guestController");
const { authenticate } = require("../middleware/auth");
const {
  resolveWedding,
  requireEditor,
} = require("../middleware/weddingAccess");
const validate = require("../middleware/validate");

const router = Router();
const RSVP_VALUES = ["Pending", "Confirmed", "Declined"];

router.use(authenticate);
router.use(resolveWedding);

router.get(
  "/",
  query("rsvp").optional().isIn(RSVP_VALUES),
  validate,
  ctrl.listGuests,
);

router.get("/:id", param("id").isUUID(), validate, ctrl.getGuest);

router.post(
  "/",
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Guest name is required")
    .isLength({ max: 200 }),
  body("rsvp").optional().isIn(RSVP_VALUES),
  body("diet").optional().trim().isLength({ max: 300 }),
  body("plusOne").optional().trim().isLength({ max: 200 }),
  validate,
  requireEditor,
  ctrl.createGuest,
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("name").optional().trim().notEmpty().isLength({ max: 200 }),
  body("rsvp").optional().isIn(RSVP_VALUES),
  body("diet").optional({ nullable: true }).trim().isLength({ max: 300 }),
  body("plusOne").optional({ nullable: true }).trim().isLength({ max: 200 }),
  validate,
  requireEditor,
  ctrl.updateGuest,
);

router.post(
  "/:id/cycle-rsvp",
  param("id").isUUID(),
  validate,
  requireEditor,
  ctrl.cycleRsvp,
);

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  requireEditor,
  ctrl.deleteGuest,
);

module.exports = router;
