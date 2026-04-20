/**
 * @file server.js
 * @description Forever Planner — Express application entry point.
 *
 * Startup order:
 *   1. Load .env
 *   2. Connect to PostgreSQL (fail fast if unreachable)
 *   3. Mount middleware
 *   4. Mount routes
 *   5. Mount error handler
 *   6. Listen
 */

"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const { testConnection } = require("../db");
const routes = require("../routes");
const path = require("path");
const errorHandler = require("../middleware/errorHandler");
const { apiLimiter } = require("../middleware/rateLimiter");
const logger = require("../utils/logger");

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Security headers ───────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }));

/* ── CORS ───────────────────────────────────────────────────── */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/* ── Body parsing ───────────────────────────────────────────── */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/* ── HTTP request logging ───────────────────────────────────── */
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      stream: { write: (msg) => logger.http(msg.trimEnd()) },
    }),
  );
}

/* ── Trust proxy (needed behind nginx / load balancer) ─────── */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* ── Rate limiter ───────────────────────────────────────────── */
app.use("/api", apiLimiter);

/* ── Routes ─────────────────────────────────────────────────── */
app.use("/api/v1", routes);

// ── Static files ─────────────────────────────────────────────
const staticDir =
  process.env.NODE_ENV === "production"
    ? path.join(__dirname, "..", "dist")
    : path.join(__dirname, "..", "public");
app.use(express.static(staticDir));

/* ── 404 fallthrough ────────────────────────────────────────── */
app.use((_req, res) => {
  res
    .status(404)
    .json({ success: false, message: "Route not found", errors: [] });
});

/* ── Global error handler ───────────────────────────────────── */
app.use(errorHandler);

/* ── Boot ───────────────────────────────────────────────────── */
const start = async () => {
  try {
    await testConnection();
    app.listen(PORT, () => {
      logger.info("Forever Planner API running", {
        port: PORT,
        env: process.env.NODE_ENV || "development",
      });
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  process.exit(0);
});

start();

module.exports = app; // exported for supertest
