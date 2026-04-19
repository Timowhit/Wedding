/**
 * @file tests/api.test.js
 * @description Integration tests for the Forever Planner API.
 *
 * Requires a running test database:
 *   DB_NAME=forever_planner_test node db/migrate.js
 *
 * Run:
 *   npm test
 */

'use strict';

process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test_secret_at_least_32_chars_long!!';
process.env.DB_NAME    = process.env.DB_NAME || 'forever_planner_test';

const request = require('supertest');
const app     = require('../server');
const { pool } = require('../db');

/* ── Helpers ─────────────────────────────────────────────────── */
const TEST_USER = {
  email:       'jest@test.com',
  password:    'Password1',
  displayName: 'Jest Tester',
};

let token;   // set after login
let userId;  // set after register

/* ── Teardown ────────────────────────────────────────────────── */
afterAll(async () => {
  // Clean up test user and cascade-delete all their data
  await pool.query('DELETE FROM users WHERE email = $1', [TEST_USER.email]);
  await pool.end();
});

/* ══════════════════════════════════════════════════════════════
   HEALTH
   ══════════════════════════════════════════════════════════════ */
describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */
describe('Auth', () => {
  describe('POST /api/v1/auth/register', () => {
    it('creates a new user and returns a token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(TEST_USER.email);
      expect(res.body.data.user.password_hash).toBeUndefined();

      token  = res.body.data.token;
      userId = res.body.data.user.id;
    });

    it('rejects duplicate email with 409', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(TEST_USER);
      expect(res.status).toBe(409);
    });

    it('rejects weak password with 422', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'weak@test.com', password: 'weak' });
      expect(res.status).toBe(422);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns a token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
      token = res.body.data.token; // refresh token
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: 'WrongPass1' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the current user when authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(TEST_USER.email);
    });

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });
});

/* ══════════════════════════════════════════════════════════════
   BUDGET
   ══════════════════════════════════════════════════════════════ */
describe('Budget', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let itemId;

  it('GET /budget/summary returns 200', async () => {
    const res = await request(app).get('/api/v1/budget/summary').set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.data.limit).toBe('number');
  });

  it('PUT /budget/limit sets the limit', async () => {
    const res = await request(app)
      .put('/api/v1/budget/limit')
      .set(auth())
      .send({ total: 25000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total)).toBe(25000);
  });

  it('POST /budget creates an expense', async () => {
    const res = await request(app)
      .post('/api/v1/budget')
      .set(auth())
      .send({ name: 'Florist deposit', category: 'Flowers', amount: 800 });
    expect(res.status).toBe(201);
    expect(res.body.data.item.name).toBe('Florist deposit');
    itemId = res.body.data.item.id;
  });

  it('GET /budget returns the expense list', async () => {
    const res = await request(app).get('/api/v1/budget').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('DELETE /budget/:id removes the expense', async () => {
    const res = await request(app).delete(`/api/v1/budget/${itemId}`).set(auth());
    expect(res.status).toBe(204);
  });

  it('DELETE /budget/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/v1/budget/00000000-0000-0000-0000-000000000000')
      .set(auth());
    expect(res.status).toBe(404);
  });
});

/* ══════════════════════════════════════════════════════════════
   CHECKLIST
   ══════════════════════════════════════════════════════════════ */
describe('Checklist', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let taskId;

  it('POST /checklist creates a task', async () => {
    const res = await request(app)
      .post('/api/v1/checklist')
      .set(auth())
      .send({ text: 'Book the venue', category: 'Venue' });
    expect(res.status).toBe(201);
    taskId = res.body.data.task.id;
  });

  it('GET /checklist returns tasks with progress', async () => {
    const res = await request(app).get('/api/v1/checklist').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBeDefined();
  });

  it('POST /checklist/:id/toggle toggles done state', async () => {
    const res = await request(app)
      .post(`/api/v1/checklist/${taskId}/toggle`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.task.done).toBe(true);
  });

  it('POST /checklist/seed loads example tasks', async () => {
    const res = await request(app).post('/api/v1/checklist/seed').set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.data.added).toBe('number');
  });

  it('DELETE /checklist/:id deletes the task', async () => {
    const res = await request(app).delete(`/api/v1/checklist/${taskId}`).set(auth());
    expect(res.status).toBe(204);
  });
});

/* ══════════════════════════════════════════════════════════════
   GUESTS
   ══════════════════════════════════════════════════════════════ */
describe('Guests', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let guestId;

  it('POST /guests creates a guest', async () => {
    const res = await request(app)
      .post('/api/v1/guests')
      .set(auth())
      .send({ name: 'Jane Smith', rsvp: 'Pending' });
    expect(res.status).toBe(201);
    expect(res.body.data.guest.name).toBe('Jane Smith');
    guestId = res.body.data.guest.id;
  });

  it('GET /guests returns list + stats', async () => {
    const res = await request(app).get('/api/v1/guests').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.guests)).toBe(true);
    expect(res.body.data.stats.total).toBeGreaterThan(0);
  });

  it('POST /guests/:id/cycle-rsvp advances RSVP status', async () => {
    const res = await request(app)
      .post(`/api/v1/guests/${guestId}/cycle-rsvp`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.guest.rsvp).toBe('Confirmed');
  });

  it('DELETE /guests/:id removes the guest', async () => {
    const res = await request(app).delete(`/api/v1/guests/${guestId}`).set(auth());
    expect(res.status).toBe(204);
  });
});

/* ══════════════════════════════════════════════════════════════
   VENDORS
   ══════════════════════════════════════════════════════════════ */
describe('Vendors', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let vendorId;

  it('POST /vendors creates a vendor', async () => {
    const res = await request(app)
      .post('/api/v1/vendors')
      .set(auth())
      .send({ name: 'Bloom Florists', category: 'Florist', status: 'Researching' });
    expect(res.status).toBe(201);
    vendorId = res.body.data.vendor.id;
  });

  it('GET /vendors returns list', async () => {
    const res = await request(app).get('/api/v1/vendors').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.vendors)).toBe(true);
  });

  it('POST /vendors/:id/cycle-status advances status', async () => {
    const res = await request(app)
      .post(`/api/v1/vendors/${vendorId}/cycle-status`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.vendor.status).toBe('Contacted');
  });

  it('DELETE /vendors/:id removes the vendor', async () => {
    const res = await request(app).delete(`/api/v1/vendors/${vendorId}`).set(auth());
    expect(res.status).toBe(204);
  });
});

/* ══════════════════════════════════════════════════════════════
   MUSIC
   ══════════════════════════════════════════════════════════════ */
describe('Music', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let trackId;

  it('POST /music/tracks adds a track', async () => {
    const res = await request(app)
      .post('/api/v1/music/tracks')
      .set(auth())
      .send({
        section:    'First Dance',
        trackId:    'test-track-001',
        trackName:  'Perfect',
        artistName: 'Ed Sheeran',
      });
    expect(res.status).toBe(201);
    trackId = res.body.data.track.id;
  });

  it('GET /music returns grouped playlists', async () => {
    const res = await request(app).get('/api/v1/music').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.playlists).toBeDefined();
  });

  it('POST /music/tracks returns 409 for duplicate', async () => {
    const res = await request(app)
      .post('/api/v1/music/tracks')
      .set(auth())
      .send({
        section:   'First Dance',
        trackId:   'test-track-001',
        trackName: 'Perfect',
      });
    expect(res.status).toBe(409);
  });

  it('DELETE /music/tracks/:id removes the track', async () => {
    const res = await request(app).delete(`/api/v1/music/tracks/${trackId}`).set(auth());
    expect(res.status).toBe(204);
  });
});

/* ══════════════════════════════════════════════════════════════
   INSPIRATION
   ══════════════════════════════════════════════════════════════ */
describe('Inspiration', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let photoId;

  it('POST /inspiration saves a photo', async () => {
    const res = await request(app)
      .post('/api/v1/inspiration')
      .set(auth())
      .send({
        photoId:    'unsplash-abc123',
        thumbUrl:   'https://images.unsplash.com/thumb.jpg',
        fullUrl:    'https://images.unsplash.com/full.jpg',
        altDesc:    'Beautiful floral arch',
      });
    expect(res.status).toBe(201);
    photoId = res.body.data.photo.id;
  });

  it('GET /inspiration returns saved board', async () => {
    const res = await request(app).get('/api/v1/inspiration').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.photos)).toBe(true);
  });

  it('POST /inspiration returns 409 for duplicate photo', async () => {
    const res = await request(app)
      .post('/api/v1/inspiration')
      .set(auth())
      .send({
        photoId:  'unsplash-abc123',
        thumbUrl: 'https://images.unsplash.com/thumb.jpg',
        fullUrl:  'https://images.unsplash.com/full.jpg',
      });
    expect(res.status).toBe(409);
  });

  it('DELETE /inspiration/:id removes the photo', async () => {
    const res = await request(app).delete(`/api/v1/inspiration/${photoId}`).set(auth());
    expect(res.status).toBe(204);
  });
});
