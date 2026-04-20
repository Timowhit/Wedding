/**
 * @file db/seed.js
 * @description Development seed script.
 *
 * Creates one demo user plus a full set of sample data across every
 * feature so you can run the app immediately without manual data entry.
 *
 * Usage:
 *   node db/seed.js
 *
 * The script is idempotent — re-running it skips rows that already exist
 * rather than throwing or duplicating data.
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
    artwork_url: null,
    preview_url: null,
  },
  {
    section: "First Dance",
    track_id: "1440830606",
    track_name: "Perfect",
    artist_name: "Ed Sheeran",
    artwork_url: null,
    preview_url: null,
  },
  {
    section: "Last Dance",
    track_id: "1440830607",
    track_name: "Don't Stop Believin'",
    artist_name: "Journey",
    artwork_url: null,
    preview_url: null,
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

    /* 2 ── Budget limit ──────────────────────────────────────── */
    console.log("\n── Budget limit");
    await client.query(
      `INSERT INTO budget_limits (user_id, total)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, BUDGET_LIMIT],
    );
    log(`budget limit $${BUDGET_LIMIT}`);

    /* 3 ── Budget items ──────────────────────────────────────── */
    console.log("\n── Budget items");
    for (const item of BUDGET_ITEMS) {
      await client.query(
        `INSERT INTO budget_items (user_id, name, category, amount)
         VALUES ($1, $2, $3, $4)`,
        [userId, item.name, item.category, item.amount],
      );
      log(`${item.name} — $${item.amount}`);
    }

    /* 4 ── Guests ────────────────────────────────────────────── */
    console.log("\n── Guests");
    for (const g of GUESTS) {
      await client.query(
        `INSERT INTO guests (user_id, name, rsvp, diet, plus_one)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, g.name, g.rsvp, g.diet, g.plus_one],
      );
      log(`${g.name} (${g.rsvp})`);
    }

    /* 5 ── Vendors ───────────────────────────────────────────── */
    console.log("\n── Vendors");
    for (const v of VENDORS) {
      await client.query(
        `INSERT INTO vendors (user_id, name, category, status, phone, email, website, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
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

    /* 6 ── Checklist tasks ───────────────────────────────────── */
    console.log("\n── Checklist tasks");
    for (let i = 0; i < TASKS.length; i++) {
      const t = TASKS[i];
      const { rows } = await client.query(
        `INSERT INTO checklist_tasks (user_id, text, category, due_date, done, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, text) DO NOTHING
         RETURNING id`,
        [userId, t.text, t.category, t.due_date, t.done, i],
      );
      rows.length ? log(t.text) : skip(t.text);
    }

    /* 7 ── Music tracks ──────────────────────────────────────── */
    console.log("\n── Music tracks");
    for (const m of MUSIC) {
      const { rows } = await client.query(
        `INSERT INTO music_tracks
           (user_id, section, track_id, track_name, artist_name, artwork_url, preview_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, section, track_id) DO NOTHING
         RETURNING id`,
        [
          userId,
          m.section,
          m.track_id,
          m.track_name,
          m.artist_name,
          m.artwork_url,
          m.preview_url,
        ],
      );
      rows.length ? log(`${m.track_name} → ${m.section}`) : skip(m.track_name);
    }

    await client.query("COMMIT");

    console.log("\n✅  Seed complete.\n");
    console.log(`   Login:  ${DEMO_EMAIL}`);
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
