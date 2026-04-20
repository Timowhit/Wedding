/**
 * @file routes/index.js
 * @description Mounts all feature routers under /api/v1.
 */

"use strict";

const { Router } = require("express");

const authRoutes = require("./auth");
const budgetRoutes = require("./budget");
const checklistRoutes = require("./checklist");
const guestRoutes = require("./guests");
const vendorRoutes = require("./vendors");
const musicRoutes = require("./music");
const inspirationRoutes = require("./inspiration");

const router = Router();

router.use("/auth", authRoutes);
router.use("/budget", budgetRoutes);
router.use("/checklist", checklistRoutes);
router.use("/guests", guestRoutes);
router.use("/vendors", vendorRoutes);
router.use("/music", musicRoutes);
router.use("/inspiration", inspirationRoutes);

/* ── Health check ───────────────────────────────────────────── */
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: { status: "ok", timestamp: new Date().toISOString() },
  });
});

module.exports = router;
