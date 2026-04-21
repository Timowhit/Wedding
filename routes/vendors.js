/**
 * @file routes/vendors.js
 */

"use strict";

const { Router } = require("express");
const { body, param, query } = require("express-validator");

const ctrl = require("../controllers/vendorController");
const { authenticate } = require("../middleware/auth");
const {
  resolveWedding,
  requireEditor,
} = require("../middleware/weddingAccess");
const validate = require("../middleware/validate");

const router = Router();

const CATEGORIES = [
  "Photographer",
  "Videographer",
  "Florist",
  "Caterer",
  "Venue",
  "DJ / Band",
  "Hair & Makeup",
  "Cake",
  "Officiant",
  "Transportation",
  "Other",
];
const STATUSES = ["Researching", "Contacted", "Booked", "Declined"];

router.use(authenticate);
router.use(resolveWedding);

router.get(
  "/",
  query("status").optional().isIn(STATUSES),
  validate,
  ctrl.listVendors,
);

router.get("/:id", param("id").isUUID(), validate, ctrl.getVendor);

router.post(
  "/",
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Vendor name is required")
    .isLength({ max: 200 }),
  body("category").isIn(CATEGORIES).withMessage("Invalid category"),
  body("phone").optional({ nullable: true }).trim().isLength({ max: 50 }),
  body("email").optional({ nullable: true }).isEmail().normalizeEmail(),
  body("website").optional({ nullable: true }).isURL(),
  body("status").optional().isIn(STATUSES),
  body("notes").optional({ nullable: true }).trim().isLength({ max: 2000 }),
  validate,
  requireEditor,
  ctrl.createVendor,
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("name").optional().trim().notEmpty().isLength({ max: 200 }),
  body("category").optional().isIn(CATEGORIES),
  body("phone").optional({ nullable: true }).trim().isLength({ max: 50 }),
  body("email").optional({ nullable: true }).isEmail().normalizeEmail(),
  body("website").optional({ nullable: true }).isURL(),
  body("status").optional().isIn(STATUSES),
  body("notes").optional({ nullable: true }).trim().isLength({ max: 2000 }),
  validate,
  requireEditor,
  ctrl.updateVendor,
);

router.post(
  "/:id/cycle-status",
  param("id").isUUID(),
  validate,
  requireEditor,
  ctrl.cycleStatus,
);

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  requireEditor,
  ctrl.deleteVendor,
);

module.exports = router;
