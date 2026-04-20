/**
 * @file routes/music.js
 */

"use strict";

const { Router } = require("express");
const { body, param, query } = require("express-validator");

const ctrl = require("../controllers/musicController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");

const router = Router();

const SECTIONS = [
  "Processional",
  "Ceremony",
  "Cocktail Hour",
  "First Dance",
  "Reception",
  "Last Dance",
];

router.use(authenticate);

/* ── iTunes proxy ───────────────────────────────────────────── */
router.get(
  "/search",
  query("q").trim().notEmpty().withMessage("q is required"),
  query("limit").optional().isInt({ min: 1, max: 25 }),
  validate,
  ctrl.searchItunes,
);

/* ── Playlists ──────────────────────────────────────────────── */
router.get("/", ctrl.getPlaylists);

router.get(
  "/section/:section",
  param("section").isIn(SECTIONS).withMessage("Invalid section"),
  validate,
  ctrl.getSection,
);

router.post(
  "/tracks",
  body("section").isIn(SECTIONS).withMessage("Invalid section"),
  body("trackId").trim().notEmpty().withMessage("trackId is required"),
  body("trackName").trim().notEmpty().withMessage("trackName is required"),
  body("artistName").optional({ nullable: true }).trim(),
  body("artworkUrl").optional({ nullable: true }).isURL(),
  body("previewUrl").optional({ nullable: true }).isURL(),
  validate,
  ctrl.addTrack,
);

router.delete("/tracks/:id", param("id").isUUID(), validate, ctrl.removeTrack);

router.delete(
  "/section/:section",
  param("section").isIn(SECTIONS).withMessage("Invalid section"),
  validate,
  ctrl.clearSection,
);

module.exports = router;
