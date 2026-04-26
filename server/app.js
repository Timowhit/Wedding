/**
 * @file server/app.js
 * @description Forever Planner — Express application entry point.
 */

"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const passport = require("passport");
const session = require("express-session");
const path = require("path");

const { testConnection } = require("./db");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");
const logger = require("./utils/logger");
const { setup: setupOAuth } = require("./utils/oauth");

setupOAuth();

const app = express();
const PORT = process.env.PORT || 3000;

class MapStore extends session.Store {
  constructor() {
    super();
    this._s = new Map();
  }
  get(sid, cb) { cb(null, this._s.get(sid) ?? null); }
  set(sid, sess, cb) { this._s.set(sid, sess); cb(null); }
  destroy(sid, cb) { this._s.delete(sid); cb(null); }
}

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  session({
    store: new MapStore(),
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 15,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      stream: { write: (msg) => logger.http(msg.trimEnd()) },
    }),
  );
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use("/api", apiLimiter);
app.use("/api/v1", routes);

// Static files live one level up from server/
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found", errors: [] });
});

app.use(errorHandler);

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

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  process.exit(0);
});

start();

module.exports = app;