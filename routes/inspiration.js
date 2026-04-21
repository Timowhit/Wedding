/**
 * @file routes/inspiration.js
 */

"use strict";

const { Router } = require("express");
const { body, param, query } = require("express-validator");

const ctrl = require("../controllers/inspirationController");
const { authenticate } = require("../middleware/auth");
const {
  resolveWedding,
  requireEditor,
} = require("../middleware/weddingAccess");
const validate = require("../middleware/validate");

const router = Router();

router.use(authenticate);
router.use(resolveWedding);

/* ── Unsplash proxy ─────────────────────────────────────────── */
router.get(
  "/search",
  query("q").trim().notEmpty().withMessage("q is required"),
  query("per_page").optional().isInt({ min: 1, max: 30 }),
  validate,
  ctrl.searchUnsplash,
);

/* ── Board ──────────────────────────────────────────────────── */
router.get("/", ctrl.getBoard);

router.post(
  "/",
  body("photoId").trim().notEmpty().withMessage("photoId is required"),
  body("thumbUrl").isURL().withMessage("thumbUrl must be a valid URL"),
  body("fullUrl").isURL().withMessage("fullUrl must be a valid URL"),
  body("altDesc").optional({ nullable: true }).trim().isLength({ max: 500 }),
  body("sourceLink").optional({ nullable: true }).isURL(),
  validate,
  requireEditor,
  ctrl.savePhoto,
);

router.delete("/board", requireEditor, ctrl.clearBoard);

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  requireEditor,
  ctrl.removePhoto,
);

module.exports = router;
