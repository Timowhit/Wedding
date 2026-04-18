# Forever Planner — Backend API

A production-ready REST API for the Forever Planner wedding app.  
Built with **Node.js**, **Express**, and **PostgreSQL**.

---

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Runtime      | Node.js ≥ 18                        |
| Framework    | Express 4                           |
| Database     | PostgreSQL 15+                      |
| Auth         | JWT (HS256) via `jsonwebtoken`      |
| Validation   | `express-validator`                 |
| Security     | `helmet`, `cors`, `express-rate-limit` |
| Logging      | `winston` + `morgan`                |
| Testing      | `jest` + `supertest`                |

---

## Project Structure

```
server/
├── controllers/          # Request handlers (business logic)
│   ├── authController.js
│   ├── budgetController.js
│   ├── checklistController.js
│   ├── guestController.js
│   ├── inspirationController.js
│   ├── musicController.js
│   └── vendorController.js
│
├── db/
│   ├── index.js          # pg Pool, query(), withTransaction()
│   ├── migrate.js        # Migration runner (node db/migrate.js)
│   └── migrations/
│       └── 001_initial.sql
│
├── middleware/
│   ├── auth.js           # JWT authenticate / optionalAuth
│   ├── errorHandler.js   # Global error serialiser
│   ├── rateLimiter.js    # API + auth rate limits
│   └── validate.js       # express-validator result checker
│
├── models/               # Data-access layer (SQL wrappers)
│   ├── Budget.js
│   ├── Checklist.js
│   ├── Guest.js
│   ├── Inspiration.js
│   ├── Music.js
│   ├── User.js
│   └── Vendor.js
│
├── routes/               # Express routers (validation chains)
│   ├── index.js          # Mounts all routers under /api/v1
│   ├── auth.js
│   ├── budget.js
│   ├── checklist.js
│   ├── guests.js
│   ├── inspiration.js
│   ├── music.js
│   └── vendors.js
│
├── utils/
│   ├── ApiError.js       # Operational error class
│   ├── asyncHandler.js   # Async route wrapper
│   ├── jwt.js            # signToken / verifyToken
│   ├── logger.js         # Winston logger
│   └── response.js       # sendSuccess / sendCreated / sendNoContent
│
├── tests/
│   └── api.test.js       # Integration tests (supertest)
│
├── .env.example
├── package.json
└── server.js             # App entry point
```

---

## Quick Start

### 1. Install dependencies
```bash
cd server
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### 3. Create the database
```sql
-- In psql:
CREATE DATABASE forever_planner;
```

### 4. Run migrations
```bash
node db/migrate.js
```

### 5. Start the server
```bash
# Development (with nodemon auto-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`.

---

## Environment Variables

| Variable                    | Default          | Description                              |
|-----------------------------|------------------|------------------------------------------|
| `NODE_ENV`                  | `development`    | `development` / `production` / `test`    |
| `PORT`                      | `3000`           | HTTP port                                |
| `DB_HOST`                   | `localhost`      | PostgreSQL host                          |
| `DB_PORT`                   | `5432`           | PostgreSQL port                          |
| `DB_NAME`                   | `forever_planner`| Database name                            |
| `DB_USER`                   | `postgres`       | Database user                            |
| `DB_PASSWORD`               | —                | Database password                        |
| `JWT_SECRET`                | —                | **Required.** Min 32-char random string  |
| `JWT_EXPIRES_IN`            | `7d`             | Token expiry (e.g. `1h`, `7d`)           |
| `BCRYPT_ROUNDS`             | `12`             | bcrypt work factor                       |
| `RATE_LIMIT_WINDOW_MS`      | `900000`         | Rate limit window (ms)                   |
| `RATE_LIMIT_MAX`            | `100`            | Max requests per window                  |
| `CORS_ORIGIN`               | `http://localhost:5173` | Allowed CORS origin               |
| `UNSPLASH_ACCESS_KEY`       | —                | Your Unsplash API key                    |

---

## API Reference

All endpoints are prefixed with `/api/v1`.  
Protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path                  | Auth | Description              |
|--------|-----------------------|------|--------------------------|
| POST   | `/auth/register`      | —    | Create account           |
| POST   | `/auth/login`         | —    | Login, receive JWT       |
| GET    | `/auth/me`            | ✓    | Get current user         |
| PATCH  | `/auth/me`            | ✓    | Update profile / wedding date |
| POST   | `/auth/me/password`   | ✓    | Change password          |

**Register / Login request body:**
```json
{ "email": "you@example.com", "password": "Password1", "displayName": "Jane" }
```

**Response envelope:**
```json
{ "success": true, "data": { "token": "eyJ...", "user": { ... } } }
```

---

### Budget

| Method | Path               | Description                        |
|--------|--------------------|------------------------------------|
| GET    | `/budget/summary`  | Limit, spent, remaining, pct       |
| PUT    | `/budget/limit`    | Set total budget `{ total: 25000 }`|
| GET    | `/budget`          | List expenses `?category=Flowers`  |
| POST   | `/budget`          | Add expense                        |
| DELETE | `/budget/:id`      | Remove expense                     |

---

### Checklist

| Method | Path                    | Description                     |
|--------|-------------------------|---------------------------------|
| GET    | `/checklist`            | List tasks `?status=active&category=Venue` |
| POST   | `/checklist`            | Create task                     |
| GET    | `/checklist/:id`        | Get task                        |
| PATCH  | `/checklist/:id`        | Update task (partial)           |
| POST   | `/checklist/:id/toggle` | Toggle done state               |
| DELETE | `/checklist/:id`        | Delete task                     |
| POST   | `/checklist/seed`       | Load example tasks              |

---

### Guests

| Method | Path                       | Description                  |
|--------|----------------------------|------------------------------|
| GET    | `/guests`                  | List guests + stats `?rsvp=Confirmed` |
| POST   | `/guests`                  | Add guest                    |
| GET    | `/guests/:id`              | Get guest                    |
| PATCH  | `/guests/:id`              | Update guest                 |
| POST   | `/guests/:id/cycle-rsvp`   | Cycle RSVP status            |
| DELETE | `/guests/:id`              | Remove guest                 |

---

### Vendors

| Method | Path                         | Description               |
|--------|------------------------------|---------------------------|
| GET    | `/vendors`                   | List vendors `?status=Booked` |
| POST   | `/vendors`                   | Add vendor                |
| GET    | `/vendors/:id`               | Get vendor                |
| PATCH  | `/vendors/:id`               | Update vendor             |
| POST   | `/vendors/:id/cycle-status`  | Cycle booking status      |
| DELETE | `/vendors/:id`               | Remove vendor             |

---

### Music

| Method | Path                         | Description                 |
|--------|------------------------------|-----------------------------|
| GET    | `/music/search?q=&limit=`    | iTunes search proxy         |
| GET    | `/music`                     | All playlists (grouped)     |
| GET    | `/music/section/:section`    | Single section tracks       |
| POST   | `/music/tracks`              | Add track to section        |
| DELETE | `/music/tracks/:id`          | Remove track                |
| DELETE | `/music/section/:section`    | Clear entire section        |

Valid sections: `Processional`, `Ceremony`, `Cocktail Hour`, `First Dance`, `Reception`, `Last Dance`

---

### Inspiration

| Method | Path                          | Description                 |
|--------|-------------------------------|-----------------------------|
| GET    | `/inspiration/search?q=`      | Unsplash proxy              |
| GET    | `/inspiration`                | Get saved board             |
| POST   | `/inspiration`                | Save photo to board         |
| DELETE | `/inspiration/:id`            | Remove photo from board     |
| DELETE | `/inspiration/board`          | Clear entire board          |

---

## Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 45, "pages": 3 }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "msg": "A valid email is required" }
  ]
}
```

---

## Running Tests

```bash
# Requires a test database: DB_NAME=forever_planner_test node db/migrate.js
npm test

# Watch mode
npm run test:watch
```

---

## Connecting the Frontend

Update `scripts/inspiration.js` to call the API instead of Unsplash directly:

```js
// Before (direct Unsplash call, exposes key):
const photos = await UnsplashService.search(query);

// After (proxied through your API):
const resp   = await fetch(`/api/v1/inspiration/search?q=${encodeURIComponent(query)}`, {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});
const { data } = await resp.json();
const photos = data.results;
```

Apply the same pattern to all other modules — replace `localStorage` reads/writes  
with `fetch` calls to the corresponding `/api/v1/*` endpoints.

---

## Production Checklist

- [ ] Set a strong random `JWT_SECRET` (≥ 32 chars)
- [ ] Set `NODE_ENV=production`
- [ ] Use a managed PostgreSQL service (RDS, Supabase, Neon)
- [ ] Enable SSL on the DB connection (`ssl.rejectUnauthorized: true`)
- [ ] Put the API behind nginx / a load balancer
- [ ] Set `CORS_ORIGIN` to your real frontend domain
- [ ] Store secrets in environment variables, never in source code
- [ ] Set up log aggregation (Datadog, Papertrail, CloudWatch)
- [ ] Add `DB_NAME=forever_planner_test` env for CI test runs
