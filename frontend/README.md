# Collectium frontend (SvelteKit SPA)

Client-rendered SvelteKit app for the existing Express + Supabase backend in the
repository root. The backend is untouched; this folder only consumes `/api/*`.

## Run

```bash
# terminal 1 — backend on :5000
npm start                 # from the repo root

# terminal 2 — app on :5173
cd frontend
npm install
npm run dev
```

`vite.config.js` proxies `/api` → `http://localhost:5000` (override with
`API_TARGET`), so requests are same-origin in development and the backend's
cookie session works unchanged. If the backend is not running, the proxy answers
with a `502` and a readable JSON error instead of an opaque `500`.

Full setup and troubleshooting: [`../usage.md`](../usage.md).

Build with `npm run build` (adapter-static, SPA fallback) and `npm run preview`.

## Layout

```
src/
  lib/
    api.js            copied verbatim from public/js/api.js
    imageTools.js     copied verbatim from public/js/views/imageTools.js
    apiClient.js      CollectiumAPI + me()/logout() on top of api.js
    stores.js         userProfile writable store + one-shot auth gate
    session.js        401 handling: clear session, go to /login?next=…
    qr.js             qrcode wrapper + share URL builders
    components/
      BinderGrid.svelte       paged grid of pockets (imperative-free)
      CaseStage.svelte        freeform shelf with pointer drag
      ItemModal.svelte        details, share URL, QR, delete
      UploadModal.svelte      auto / snip / perspective / square pipeline
      LayoutCustomizer.svelte pages · rows · cols · grid
      CollectionCard.svelte   profile grid card
      GuestLanding.svelte     "enter a handle" form
  routes/
    +layout.js        ssr = false, prerender = false
    +layout.svelte    global CSS, single session probe
    +page.svelte      guest landing / redirect when signed in
    login/+page.svelte
    signup/+page.svelte
    profile/+page.svelte
    collection/+page.svelte
```

## Decisions worth knowing

- **Query-string routing is preserved.** `/profile?u=<username>` and
  `/collection?id=<uuid>&item=<uuid>` stay exactly as they were, so existing QR
  codes and shared links keep working.
- **The canvas editors stay imperative.** `InteractiveOutlineEditor` and
  `SquareCropEditor` are instantiated once in `UploadModal`'s `onMount`, after
  `tick()`. Their canvases are always mounted (the wrapper is hidden with the
  `hidden` attribute) so mode switches never detach a canvas from its editor.
  Only presentation mirrors (`pointCount`, `cutoutClosed`, `zoom`) are reactive.
- **Session handling.** Sign-in uses `POST /api/auth/login`, which sets two
  httpOnly cookies (`collectium_access`, `collectium_refresh`) and returns the
  profile. `CollectiumAPI.me()` reads `GET /api/auth/me`, and logout calls
  `POST /api/auth/logout`. No token or profile is written to `localStorage` by
  this app. The Express routes also still accept `Authorization: Bearer`, so the
  legacy pages in `public/` keep working unchanged.
- **No auth data is added by this app.** The browser holds the httpOnly cookies;
  the open tab holds the profile only in the `userProfile` store. `api.js`'s own
  `Session` is cleared after login so a leftover legacy token cannot shadow the
  cookie.
- **Writes only happen on release.** Case drag updates local positions during
  `pointermove` and persists once on `pointerup` (only if the pointer moved
  ≥ 5 px); a shorter press opens the item instead.
- **No SSR, no `load()`.** Every page fetches in `onMount`; `?u=`/`?id=` changes
  are handled with `page` store subscriptions because SvelteKit keeps the
  component mounted when only the query string changes.
