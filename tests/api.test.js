/**
 * @file tests/api.test.js
 * @description Integration tests using supertest.
 * Requires a running test database: DB_NAME=forever_planner_test
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_32_chars_long_padding';

const request = require('supertest');
const app     = require('../server');
const db      = require('../db');

let token;
let createdItemId;

/* ── Helpers ────────────────────────────────────────────────── */
const authHeader = () => ({ Authorization: `Bearer ${token}` });

/* ── Lifecycle ──────────────────────────────────────────────── */
afterAll(async () => {
  // Clean up test user and close pool
  await db.query('DELETE FROM users WHERE email = $1', ['test@forever.test']);
  await db.pool.end();
});

/* ======================================================
   AUTH
   ====================================================== */
describe('POST /api/v1/auth/register', () => {
  it('creates a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@forever.test', password: 'Password1', displayName: 'Tester' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    token = res.body.data.token;
  });

  it('rejects duplicate email with 409', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@forever.test', password: 'Password1' })
      .expect(409);
  });

  it('rejects weak password with 422', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'other@test.com', password: 'weak' })
      .expect(422);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@forever.test', password: 'Password1' })
      .expect(200);

    expect(res.body.data.token).toBeDefined();
  });

  it('rejects wrong password with 401', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@forever.test', password: 'WrongPass1' })
      .expect(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns current user', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader())
      .expect(200);

    expect(res.body.data.user.email).toBe('test@forever.test');
  });

  it('rejects unauthenticated request', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });
});

/* ======================================================
   BUDGET
   ====================================================== */
describe('Budget endpoints', () => {
  it('GET /budget/summary returns zeroed state', async () => {
    const res = await request(app)
      .get('/api/v1/budget/summary')
      .set(authHeader())
      .expect(200);

    expect(res.body.data.spent).toBe(0);
  });

  it('PUT /budget/limit sets a budget', async () => {
    await request(app)
      .put('/api/v1/budget/limit')
      .set(authHeader())
      .send({ total: 25000 })
      .expect(200);
  });

  it('POST /budget creates an expense', async () => {
    const res = await request(app)
      .post('/api/v1/budget')
      .set(authHeader())
      .send({ name: 'Florist deposit', category: 'Flowers', amount: 500 })
      .expect(201);

    expect(res.body.data.item.name).toBe('Florist deposit');
    createdItemId = res.body.data.item.id;
  });

  it('GET /budget lists expenses', async () => {
    const res = await request(app)
      .get('/api/v1/budget')
      .set(authHeader())
      .expect(200);

    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('DELETE /budget/:id removes expense', async () => {
    await request(app)
      .delete(`/api/v1/budget/${createdItemId}`)
      .set(authHeader())
      .expect(204);
  });

  it('returns 404 for unknown expense', async () => {
    await request(app)
      .delete('/api/v1/budget/00000000-0000-0000-0000-000000000000')
      .set(authHeader())
      .expect(404);
  });
});

/* ======================================================
   HEALTH
   ====================================================== */
describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });
});
