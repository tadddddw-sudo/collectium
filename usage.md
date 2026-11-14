# Collectium — how to run it

There are **two servers** in this repo. They do different jobs and both must be
running:

| # | What | Folder | Port | Started with |
|---|------|--------|------|--------------|
| 1 | Express API + Supabase + the old HTML pages | repository root | **5000** | `node index.js` |
| 2 | SvelteKit app (the new frontend) | `frontend/` | **5173** | `npm run dev` |

The SvelteKit app has no API of its own. It sends every `/api/...` request to the
Express server through a Vite dev proxy, so the browser only ever talks to
`localhost:5173` and cookies work as if everything were one site.

```
browser ──▶ localhost:5173  (SvelteKit, Vite)
                │
                └─ /api/* proxied ──▶ localhost:5000 (Express + Supabase)
```

`node index.js` alone gives you `http://localhost:5000`. That is only the API and
the legacy pages — **not** the new app. The new app is on `:5173`.

---

## 1. Prerequisites

- Node.js 18 or newer (`node -v`)
- The project's Supabase credentials

## 2. Environment file

Create or edit `.env` in the repository root (not inside `frontend/`):

```env
PORT=5000
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_KEY=<your-anon-key>
```

`.env` is loaded relative to `index.js`, so the backend works no matter which
folder you launch it from. If the file is missing, the backend now stops with a
message telling you exactly which variables are missing instead of failing later.

## 3. Install dependencies (once)

```bash
# repository root — backend
npm install

# new frontend
cd frontend
npm install
cd ..
```

## 4. Start the backend — terminal 1

From the **repository root**:

```bash
node index.js
```

Expected output:

```
  Collectium API   http://localhost:5000
  Legacy pages     http://localhost:5000/index.html

  The SvelteKit app runs separately:
    cd frontend && npm run dev   ->  http://localhost:5173
```

Quick check that it is alive:

```bash
curl http://localhost:5000/api/health
# {"ok":true,"service":"collectium-api"}
```

## 5. Start the frontend — terminal 2

From the **`frontend/` folder**:

```bash
cd frontend
npm run dev
```

Expected output:

```
VITE v5.x  ready
➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173**.

`npm run dev` uses `strictPort: true`, so if 5173 is taken it fails loudly
instead of silently moving to 5174.

## 6. Use it

- `/` — guest landing: type a handle to view that collector, or sign in.
- `/signup` — create an account.
- `/login` — sign in.
- `/profile?u=<username>` — a collector's binders and display cases.
- `/collection?id=<uuid>` — a binder or display case.
- `/collection?id=<uuid>&item=<uuid>` — opens one item's share dialog (QR code).
- `http://localhost:5000/*.html` — the old vanilla-JS pages still work.

---

## Authentication model

The SPA signs in through `POST /api/auth/login`. The Express server asks
Supabase for a session, then stores the tokens in **httpOnly cookies**:

| Cookie | Purpose | Lifetime |
|---|---|---|
| `collectium_access` | Supabase access token | ~1 hour |
| `collectium_refresh` | Supabase refresh token | 30 days |

- `httpOnly` — JavaScript cannot read them, so XSS cannot steal the session.
- `SameSite=Lax` — sent on same-site requests (the dev proxy makes everything
  same-site).
- `Secure` is off on localhost (plain http) and can be enabled in production
  with `NODE_ENV=production COOKIE_SECURE=true`.

The frontend never writes tokens or profiles to `localStorage`. The only thing
stored client-side is nothing at all: the browser holds the cookies, and the
in-memory `userProfile` store holds the profile while a tab is open.

`GET /api/auth/me` returns the current profile (`{ profile }`) or
`{ profile: null }` for a guest. `POST /api/auth/logout` revokes the session and
clears both cookies.

### Legacy compatibility

The old pages in `public/` authenticate with an `Authorization: Bearer <token>`
header and keep the token in `localStorage`, exactly as before. All API routes
accept **either** the bearer header or the cookie, so both frontends work at the
same time. A legacy visitor who calls `/api/auth/me` with a valid bearer token is
also given a cookie, so they can switch to the SPA without signing in again.

---

## Troubleshooting

### "Cannot reach the API server at http://localhost:5000"

The SvelteKit app is running but the backend is not. Start terminal 1
(`node index.js`). This message replaced the old opaque `500` error.

### Everything returns `500` / `Request failed (500)`

Almost always the same cause: **the backend is not running, or crashed at
startup.** Check terminal 1. If it printed an env error, fix `.env`.

### `Port 5000 is already in use`

Another copy of the backend is running. Either use it, or:

```bash
lsof -ti tcp:5000 | xargs kill      # macOS / Linux
# or run this copy elsewhere:
PORT=5001 node index.js
```

If you change the port, start the frontend with a matching target:

```bash
cd frontend
API_TARGET=http://localhost:5001 npm run dev
```

### `Port 5173 is already in use`

```bash
lsof -ti tcp:5173 | xargs kill
```

### Login succeeds but the next page says you are a guest

The browser dropped the cookie. Make sure you open the app on
`http://localhost:5173` (not `127.0.0.1` and not a mix of both — cookies are
per-host), and that you have not blocked cookies for localhost.

### `Profile not found` for your own account

The Supabase `profiles` row is missing. Signing up creates it via a database
trigger; if it is missing, recreate the user or restore the row.

### The QR code points at the wrong host

Share URLs are built from `location.origin`. If you open the app via
`http://localhost:5173`, links and QR codes point there. Open via a normal
domain in production.

---

## Production build

```bash
cd frontend
npm run build     # static SPA in frontend/build
npm run preview   # serves it on :4173 with the same /api proxy
```

`vite preview` is a local check only. For a real deployment, serve
`frontend/build` and reverse-proxy `/api` to the Express server **on the same
origin**, so the session cookies are sent. See `frontend/README.md` for the
component/file map.

## API reference

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | – | liveness probe |
| POST | `/api/auth/signup` | – | `{username,email,password}` |
| POST | `/api/auth/login` | – | sets cookies, returns `{user,session,profile}` |
| GET | `/api/auth/me` | cookie/bearer | `{profile}` or `{profile:null}` |
| POST | `/api/auth/logout` | cookie/bearer | clears cookies |
| GET | `/api/profiles/:username` | optional | profile + collections |
| GET | `/api/collections/:id` | optional | collection + items |
| POST | `/api/collections` | required | create binder/case |
| PATCH | `/api/collections/:id` | required | title / `layout_config` |
| DELETE | `/api/collections/:id` | required | delete collection |
| POST | `/api/collections/:id/items` | required | multipart upload |
| PATCH | `/api/items/:id` | required | `position_data`, slot |
| DELETE | `/api/items/:id` | required | delete item |

"required" routes accept either the session cookie or a bearer token.

## Scripts

| Where | Command | Does |
|---|---|---|
| root | `node index.js` | backend on :5000 |
| `frontend/` | `npm run dev` | SvelteKit dev server on :5173 |
| `frontend/` | `npm run build` | static SPA into `frontend/build` |
| `frontend/` | `npm run preview` | preview the build on :4173 |
