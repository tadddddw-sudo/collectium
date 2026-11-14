# Collectium — how to run it

One repository, one `package.json`, one server. Express serves both the API and
the SvelteKit single-page app.

| What | Folder | Port | Started with |
|---|---|---|---|
| Express API + SvelteKit app | repository root | **5000** | `npm start` |

```
browser ──▶ localhost:5000  (Express)
                ├─ /api/*  ──▶ routes/* (Supabase)
                └─ /*      ──▶ dist/ (SvelteKit SPA)
```

For development you can instead run the Vite dev server on `:5173`; it proxies
`/api` to the Express API on `:5000`, so cookies stay same-site.

```
browser ──▶ localhost:5173  (Vite + SvelteKit, hot reload)
                │
                └─ /api/* proxied ──▶ localhost:5000 (Express + Supabase)
```

---

## 1. Prerequisites

- Node.js 18 or newer (`node -v`)
- The project's Supabase credentials

## 2. Environment file

Create or edit `.env` in the repository root:

```env
PORT=5000
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_KEY=<your-anon-key>
```

`.env` is loaded relative to `index.js`, so the server works no matter which
folder you launch it from. If the file is missing, the server stops with a
message telling you exactly which variables are missing.

Optional settings:

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | unset | Public origin, e.g. `https://collectium.example`. Password reset emails link to `APP_URL/reset-password`. Without it Supabase uses the project's Site URL and the app forwards the link. |
| `TRUST_PROXY` | unset | Number of reverse-proxy hops in front of Node (usually `1`). Required behind a proxy, or every visitor shares one rate-limit bucket. Leave unset if Node is exposed directly. |
| `CORS_ORIGINS` | unset | Comma-separated origins allowed to make credentialed cross-origin API calls. The SPA is same-origin and needs none. |
| `COOKIE_SECURE` | on in production | Set `false` only for a production deployment served over plain http. |

## 3. Install dependencies (once)

```bash
npm install
```

## 4. Production-style run

```bash
npm run build     # SvelteKit SPA -> dist/
npm start         # Express on :5000 serves the API and dist/
```

Open **http://localhost:5000**.

Expected output:

```
  Collectium   http://localhost:5000
```

Quick check that it is alive:

```bash
curl http://localhost:5000/api/health
# {"ok":true,"service":"collectium-api"}
```

The server falls back to `dist/index.html` for any non-`/api` path, so
`/profile?u=…` and `/collection?id=…` survive a page reload. If `dist/` is
missing, `/` answers with a 503 telling you to run `npm run build`.

## 5. Development with hot reload — two terminals

```bash
# terminal 1 — API on :5000
npm start

# terminal 2 — Vite dev server on :5173
npm run dev
```

Open **http://localhost:5173**. `vite.config.js` proxies `/api` →
`http://localhost:5000` (override with `API_TARGET`). `strictPort: true` means a
taken port fails loudly instead of silently moving to 5174.

## 6. Use it

- `/` — home: look up a collector by handle, and (when signed in) see your own
  collections.
- `/signup` — create an account.
- `/login` — sign in.
- `/forgot-password` — request a password reset email.
- `/reset-password` — where the reset email lands; choose a new password.
- `/profile?u=<username>` — a collector's banner, bio and shelves.
- `/collection?id=<uuid>` — a binder or display case.
- `/collection?id=<uuid>&item=<uuid>` — opens one item's share dialog (QR code).
- `/settings` — account details, profile QR, data download, account deletion, sign out.
- `/terms`, `/privacy` — Terms of Service and Privacy Policy (accepted at signup).

The interface is a Windows-Aero/Frutiger-Aero dark skin (glossy cyan buttons,
glass slabs, inset inputs) over a collapsible left rail. Hover or keyboard-focus
the rail to expand it from 72 px to 240 px. All styling lives in `src/app.css`;
there are no image assets.

---

## Repository layout

```
index.js              Express: static SPA + /api routes + SPA fallback
sessions.js           cookie sessions, bearer-token compatibility
supabaseClient.js     Supabase clients (anon + per-user + per-request isolated)
rateLimits.js         express-rate-limit limiters
asyncRouter.js        Router that forwards async errors to the error handler
validation.js         field allowlists for PATCH bodies
routes/               auth.js · profiles.js · collections.js · items.js
src/
  app.html            SvelteKit HTML shell
  app.css             the Aero design system
  lib/
    api.js            fetch wrapper for every /api call
    apiClient.js      CollectiumAPI + me()/logout()
    stores.js         userProfile writable store + one-shot auth gate
    session.js        401 handling: clear profile, go to /login?next=…
    qr.js             qrcode wrapper + share URL builders
    imageTools.js     canvas editors (snip / perspective / crop)
    components/       AppShell · Logo · BinderGrid · CaseStage · ItemModal …
  routes/             / · /login · /signup · /profile · /collection · /settings
svelte.config.js      adapter-static, SPA fallback
vite.config.js        dev server + /api proxy
DESIGN.md             how the Figma wireframes and Styles.md map to the UI
dist/                 build output (generated, git-ignored)
```

---

## Authentication model

The SPA signs in through `POST /api/auth/login`. The Express server asks
Supabase for a session, then stores the tokens in **httpOnly cookies**:

| Cookie | Purpose | Lifetime |
|---|---|---|
| `collectium_access` | Supabase access token | ~1 hour |
| `collectium_refresh` | Supabase refresh token | 30 days |

- `httpOnly` — JavaScript cannot read them, so XSS cannot steal the session.
- `SameSite=Lax` — sent on same-site requests (same origin in production, same
  origin through the dev proxy).
- `Secure` is on whenever `NODE_ENV=production` (opt out with
  `COOKIE_SECURE=false`) and off in development, where localhost is plain http.

The frontend never writes tokens or profiles to `localStorage`. The browser
holds the cookies, and the in-memory `userProfile` store holds the profile while
a tab is open.

`GET /api/auth/me` returns the current profile (`{ profile }`) or
`{ profile: null }` for a guest. `POST /api/auth/logout` revokes the session and
clears both cookies.

### Non-browser API clients

Every API route also accepts `Authorization: Bearer <token>`, so scripts and
native clients can use the API without cookies. A bearer caller who hits
`/api/auth/me` is also given a cookie session.

---

## Troubleshooting

### "Cannot reach the API server at http://localhost:5000"

You are on the Vite dev server (`:5173`) but the API is not running. Start
`npm start` in another terminal.

### Everything returns `500` / `Request failed (500)`

Almost always the same cause: **the backend is not running, or crashed at
startup.** Check its terminal. If it printed an env error, fix `.env`.

### `Port 5000 is already in use`

Another copy of the server is running. Either use it, or:

```bash
lsof -ti tcp:5000 | xargs kill      # macOS / Linux
# or run this copy elsewhere:
PORT=5001 npm start
```

If you change the port, start the dev server with a matching target:

```bash
API_TARGET=http://localhost:5001 npm run dev
```

### `Port 5173 is already in use`

```bash
lsof -ti tcp:5173 | xargs kill
```

### Login succeeds but the next page says you are a guest

The browser dropped the cookie. Use one host consistently (`localhost`, not a
mix of `localhost` and `127.0.0.1` — cookies are per-host), and make sure cookies
are not blocked for it.

### `/` answers 503 "has not been built yet"

Run `npm run build`, then restart the server (or use the dev server on `:5173`).

### `Profile not found` for your own account

The Supabase `profiles` row is missing. Signing up creates it via a database
trigger; if it is missing, recreate the user or restore the row.

### The QR code points at the wrong host

Share URLs are built from `location.origin`. Open the app on the host you want
links to use.

---

## Production build

```bash
npm run build     # static SPA in dist/
npm start         # Express serves dist/ and the API on one origin
```

`npm run preview` (`:4173`) is only a local check of the build. For a real
deployment, run `npm start` behind a TLS-terminating reverse proxy and set
`NODE_ENV=production TRUST_PROXY=1 APP_URL=https://<your-host>`.

## API reference

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | – | liveness probe |
| POST | `/api/auth/signup` | – | `{username,email,password,accepted_terms:true}` |
| POST | `/api/auth/login` | – | sets cookies, returns `{user,session,profile}` |
| GET | `/api/auth/me` | cookie/bearer | `{profile}` or `{profile:null}` |
| POST | `/api/auth/logout` | cookie/bearer | clears cookies |
| POST | `/api/auth/forgot-password` | – | `{email}`; same answer whether or not the account exists |
| POST | `/api/auth/reset-password` | reset link | `{password, token_hash}` or `{password, access_token, refresh_token}`; signs out every session |
| DELETE | `/api/auth/account` | cookie/bearer | `{password}`; deletes images, rows and the auth user |
| GET | `/api/profiles/:username` | optional | profile + collections |
| GET | `/api/collections/:id` | optional | collection + items |
| POST | `/api/collections` | required | create binder/case |
| PATCH | `/api/collections/:id` | required | only `title`, `description`, `layout_config`, `is_public`, `sort_order` |
| DELETE | `/api/collections/:id` | required | delete collection |
| POST | `/api/collections/:id/items` | required | multipart upload; PNG or WebP only (checked by content), own collections only |
| PATCH | `/api/items/:id` | required | only `name`, `description`, `page_number`, `slot_index`, `position_data` |
| DELETE | `/api/items/:id` | required | delete item |

"required" routes accept either the session cookie or a bearer token.

## Rate limits

Limits are per IP unless noted, kept in memory (per process, reset on
restart). Exceeding one returns `429` with `{error, code: "RATE_LIMITED"}` and
`RateLimit` headers. With several server instances, move them to a shared store
such as Redis (see `rateLimits.js`).

| What | Limit |
|---|---|
| All `/api` requests | 600 / 15 min |
| Failed logins | 10 / 15 min per IP, 30 / hour per account |
| Signups | 5 / hour |
| Password reset emails | 5 / hour per IP, 3 / hour per email address |
| Password reset submissions | 10 / 15 min |
| Account deletion | 5 / 15 min |
| Image uploads | 60 / 15 min |
| Collection and item edits | 300 / 15 min |

## Password reset setup

In the Supabase dashboard (Authentication → URL Configuration), add
`https://<your-host>/reset-password` (and `http://localhost:5000/reset-password`
for development) to **Redirect URLs**, and set `APP_URL` to match. The default
"Reset Password" email template works as is. If you change it to
`{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`, the
page and API handle that form too.

Reset links work once and expire (Supabase default: 1 hour). After a reset the
server signs the user out of every device.

## Account deletion setup

`DELETE /api/auth/account` needs two things in Supabase that the anon key
cannot do by itself: a storage policy that lets users delete their own images,
and the `delete_my_account()` SQL function that removes their rows and auth
user. Run `supabase/account-deletion.sql` once in the Supabase SQL Editor.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Express on :5000, serving `dist/` + `/api` |
| `npm run dev` | Vite dev server on :5173 with hot reload and an `/api` proxy |
| `npm run build` | static SPA into `dist/` |
| `npm run preview` | preview the build on :4173 |
