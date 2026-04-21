/**
 * @file db/seed.js
 *
 * Fix: all feature-table INSERTs now use wedding_id instead of user_id,
 * matching the models.  The script creates (or reuses) a wedding for the
 * demo user before inserting any data.
 *
 * Usage:  node db/seed.js
 */

"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const { pool } = require("./index");

/* ── Demo credentials ────────────────────────────────────────── */
const DEMO_EMAIL = "demo@foreverplanner.com";
const DEMO_PASSWORD = "Demo1234";
const DEMO_NAME = "Demo Couple";
const WEDDING_DATE = "2026-09-20";
const WEDDING_NAME = "Demo Couple's Wedding";

/* ── Seed data ───────────────────────────────────────────────── */
const GUESTS = [
  {
    name: "Alice Johnson",
    rsvp: "Confirmed",
    diet: "Vegan",
    plus_one: "Bob Johnson",
  },
  { name: "Carol Williams", rsvp: "Confirmed", diet: null, plus_one: null },
  { name: "David Brown", rsvp: "Pending", diet: "Gluten-free", plus_one: null },
  { name: "Emma Davis", rsvp: "Pending", diet: null, plus_one: "Frank Davis" },
  { name: "Grace Miller", rsvp: "Declined", diet: null, plus_one: null },
];

const VENDORS = [
  {
    name: "Bloom & Blossom Florists",
    category: "Florist",
    status: "Booked",
    phone: "555-0101",
    email: "hello@bloomfloral.com",
    website: null,
    notes: "Deposit paid. Peonies confirmed.",
  },
  {
    name: "Lens & Love Photography",
    category: "Photographer",
    status: "Booked",
    phone: "555-0102",
    email: "contact@lensandlove.com",
    website: "https://lensandlove.com",
    notes: "8-hour package.",
  },
  {
    name: "The Grand Ballroom",
    category: "Venue",
    status: "Booked",
    phone: "555-0103",
    email: null,
    website: "https://grandballroom.com",
    notes: "Capacity 200.",
  },
  {
    name: "Sweet Tiers Bakery",
    category: "Cake",
    status: "Contacted",
    phone: "555-0104",
    email: "orders@sweettiers.com",
    website: null,
    notes: "Awaiting tasting appointment.",
  },
  {
    name: "Harmony DJ Services",
    category: "DJ / Band",
    status: "Researching",
    phone: null,
    email: "info@harmonydj.com",
    website: "https://harmonydj.com",
    notes: null,
  },
];

const BUDGET_LIMIT = 30000;
const BUDGET_ITEMS = [
  { name: "Venue deposit", category: "Venue", amount: 5000 },
  { name: "Photographer booking", category: "Photography", amount: 3200 },
  { name: "Florist deposit", category: "Flowers", amount: 800 },
  { name: "Wedding dress", category: "Attire", amount: 2200 },
  { name: "Catering estimate", category: "Catering", amount: 6000 },
  { name: "Save-the-date cards", category: "Invitations", amount: 180 },
];

const TASKS = [
  {
    text: "Book the venue",
    category: "Venue",
    due_date: "2025-09-01",
    done: true,
  },
  {
    text: "Book the photographer",
    category: "Photography",
    due_date: "2025-09-15",
    done: true,
  },
  {
    text: "Order wedding dress",
    category: "Attire",
    due_date: "2025-11-01",
    done: false,
  },
  {
    text: "Send save-the-date cards",
    category: "Invitations",
    due_date: "2025-10-01",
    done: false,
  },
  {
    text: "Choose a caterer",
    category: "Catering",
    due_date: "2025-12-01",
    done: false,
  },
  {
    text: "Book hair & makeup artist",
    category: "Beauty",
    due_date: "2026-01-15",
    done: false,
  },
  {
    text: "Choose wedding flowers",
    category: "Flowers",
    due_date: "2026-02-01",
    done: false,
  },
  {
    text: "Book honeymoon travel",
    category: "Honeymoon",
    due_date: "2026-03-01",
    done: false,
  },
  {
    text: "Finalise guest list",
    category: "Other",
    due_date: "2025-10-15",
    done: false,
  },
  {
    text: "Arrange transportation",
    category: "Other",
    due_date: "2026-04-01",
    done: false,
  },
];

const MUSIC = [
  {
    section: "Processional",
    track_id: "1440830605",
    track_name: "A Thousand Years",
    artist_name: "Christina Perri",
  },
  {
    section: "First Dance",
    track_id: "1440830606",
    track_name: "Perfect",
    artist_name: "Ed Sheeran",
  },
  {
    section: "Last Dance",
    track_id: "1440830607",
    track_name: "Don't Stop Believin'",
    artist_name: "Journey",
  },
];

/* ── Helpers ─────────────────────────────────────────────────── */
const log = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  – ${msg} (already exists, skipped)`);

/* ── Main ────────────────────────────────────────────────────── */
(async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* 1 ── User ──────────────────────────────────────────────── */
    console.log("\n── User");
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [DEMO_EMAIL],
    );

    let userId;
    if (existing.rows.length) {
      userId = existing.rows[0].id;
      skip(`user ${DEMO_EMAIL}`);
    } else {
      const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, wedding_date)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [DEMO_EMAIL, hash, DEMO_NAME, WEDDING_DATE],
      );
      userId = rows[0].id;
      log(`created user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    }

    /* 2 ── Wedding ───────────────────────────────────────────── */
    console.log("\n── Wedding");
    let weddingId;
    const existingWedding = await client.query(
      `SELECT wm.wedding_id FROM wedding_members wm
       WHERE wm.user_id = $1 AND wm.role = 'owner' LIMIT 1`,
      [userId],
    );

    if (existingWedding.rows.length) {
      weddingId = existingWedding.rows[0].wedding_id;
      skip("wedding");
    } else {
      const { rows: wRows } = await client.query(
        `INSERT INTO weddings (name, wedding_date, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [WEDDING_NAME, WEDDING_DATE, userId],
      );
      weddingId = wRows[0].id;
      await client.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [weddingId, userId],
      );
      log(`created wedding "${WEDDING_NAME}"`);
    }

    /* 3 ── Budget limit ──────────────────────────────────────── */
    console.log("\n── Budget limit");
    await client.query(
      `INSERT INTO budget_limits (wedding_id, total)
       VALUES ($1, $2)
       ON CONFLICT (wedding_id) DO NOTHING`,
      [weddingId, BUDGET_LIMIT],
    );
    log(`budget limit $${BUDGET_LIMIT}`);

    /* 4 ── Budget items ──────────────────────────────────────── */
    console.log("\n── Budget items");
    for (const item of BUDGET_ITEMS) {
      await client.query(
        `INSERT INTO budget_items (wedding_id, name, category, amount)
         VALUES ($1, $2, $3, $4)`,
        [weddingId, item.name, item.category, item.amount],
      );
      log(`${item.name} — $${item.amount}`);
    }

    /* 5 ── Guests ────────────────────────────────────────────── */
    console.log("\n── Guests");
    for (const g of GUESTS) {
      await client.query(
        `INSERT INTO guests (wedding_id, name, rsvp, diet, plus_one)
         VALUES ($1, $2, $3, $4, $5)`,
        [weddingId, g.name, g.rsvp, g.diet, g.plus_one],
      );
      log(`${g.name} (${g.rsvp})`);
    }

    /* 6 ── Vendors ───────────────────────────────────────────── */
    console.log("\n── Vendors");
    for (const v of VENDORS) {
      await client.query(
        `INSERT INTO vendors (wedding_id, name, category, status, phone, email, website, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          weddingId,
          v.name,
          v.category,
          v.status,
          v.phone,
          v.email,
          v.website,
          v.notes,
        ],
      );
      log(`${v.name} (${v.status})`);
    }

    /* 7 ── Checklist tasks ───────────────────────────────────── */
    console.log("\n── Checklist tasks");
    for (let i = 0; i < TASKS.length; i++) {
      const t = TASKS[i];
      const { rows } = await client.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, done, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (wedding_id, text) DO NOTHING
         RETURNING id`,
        [weddingId, t.text, t.category, t.due_date, t.done, i],
      );
      rows.length ? log(t.text) : skip(t.text);
    }

    /* 8 ── Music tracks ──────────────────────────────────────── */
    console.log("\n── Music tracks");
    for (const m of MUSIC) {
      const { rows } = await client.query(
        `INSERT INTO music_tracks
           (wedding_id, section, track_id, track_name, artist_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wedding_id, section, track_id) DO NOTHING
         RETURNING id`,
        [weddingId, m.section, m.track_id, m.track_name, m.artist_name],
      );
      rows.length ? log(`${m.track_name} → ${m.section}`) : skip(m.track_name);
    }

    await client.query("COMMIT");

    console.log("\n✅  Seed complete.\n");
    console.log(`   Login:    ${DEMO_EMAIL}`);
    console.log(`   Password: ${DEMO_PASSWORD}\n`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌  Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
