# Design notes — how the Figma file maps to the app

Source: `sajtprototip` (`e0OpxA5uL8mcqWZvWRdWkh`), read through the Figma MCP
(`get_metadata`, `get_design_context`, `get_screenshot` for every frame on
`Page 1`). The file is a low-fidelity wireframe set: 1440 × 1024 frames, grey
slabs, no colour. `Styles.md` supplies the visual language, so the job was
**structure from Figma, skin from Styles.md**.

## What the Figma actually specifies

| Frame | Measurements | Read as |
|---|---|---|
| `sb small` / `sb big` | rail 16,16 · 72×992 **and** 240×992; items 48×48 (icons) vs 216×48 (icon + label); logo top, settings pinned to bottom at y=948 | one collapsible sidebar, not two pages |
| `home(small sidebar)` / `home(extended sidebar)` | page title 200×56 at x=280,y=24; search bar 640×48 at x=400,y=124; filter chip 110×32 at y=184 | title row, then a handle search, then content (**scope chips dropped**: only collectors are searchable) |
| `profile` | banner 768×240; name/pfp 768×152; bio 768×146; "featured collections" label; three 256×56 showcase chips; 24×24 edit dots top-right of each block | stacked full-width slabs (banner → identity → bio → featured → shelves) |
| `my collections` | three 768×240 rows at y=256/512/768 | list rows, not a card grid |
| `search results` | three 768×240 rows, each with a 384×216 image on the left | results are horizontal rows with a large thumbnail |
| `settings` | search 640×48 + four 768×152 “setting group” slabs | grouped setting panels |
| `notif` | 12 × 768×56 rows + `filters` + `mark all as read` chips | dense notification list |
| `forum` | 768×768 single block + search + filters | one large feed container |
| logo frames | five rounded bars, colours `#ff9f04 #db8802 #b06c00 #8c5701 #6a4200`, rotated −90/45/0/−45/−90 | the isometric "C" |

Constants that drove the layout: **768 px content column**, **16 px page
gutter**, **~8–14 px radii**, **56 px compact rows**, **240 px feature slabs**.

## How it was applied

- **App shell** (`lib/components/AppShell.svelte`): a fixed 72 px glass rail at
  16 px inset that widens to 240 px on hover/focus — the `sb small` → `sb big`
  states become one interaction instead of two screens. Content sits in a
  centred 768 px column (1040 px on the binder/case viewer). On phones the rail
  becomes a bottom bar.
- **Home** (`routes/+page.svelte`): title → handle search bar; when signed in,
  the "your collections" rows appear below. The Figma's "Collectors" /
  "Binders & cases" scope chips were removed — there is only one thing to
  search, so they were pure noise.
- **Profile** (`routes/profile/+page.svelte`): banner slab (190 px) → overlapping
  identity slab → bio slab → `Featured collections` chips → full-width
  collection rows. The Figma's stacked 240/152/146 blocks are preserved as
  proportions.
- **Collections** (`lib/components/CollectionCard.svelte`): the 768×240 row with
  a left thumbnail, cyan data badge, title, count, and a chevron — used for both
  binders and cases (the `my collections` / `search results` frames).
- **Settings** (`routes/settings`): the `setting group` slabs, reusing the same
  two-column label/value rhythm.
- **Binder pockets**: inset dark wells with a lip of light, matching the "carved
  plastic" direction; art gets a deep cast shadow so pieces read as objects.
- **Case stage**: a dark reflective shelf with a specular band at 50 % height.
- **Logo** (`lib/components/Logo.svelte`): the five bars recreated in CSS at the
  Figma angles and colours; no SVG, no image.

## Deliberate deviations

0. **The rail holds only real, distinct destinations.** Logged out: Home,
   Settings, Sign in. Logged in: Home, My collections, Settings, Sign out. The
   identity chip in the rail foot is a label, not a second link to the profile,
   and the route highlight is derived once (`activeId`) so it cannot stick on a
   stale page.

1. **Forum, notifications, search-results pages are not built.** The Express
   backend has no forum, notification, or search endpoints, and the brief forbids
   inventing data. The rail therefore exposes only routes that actually work.
   `search results` is represented by the handle lookup on Home, which resolves
   to a real profile.
2. **`Featured collections` is derived**, not authored — the backend has no
   featured flag, so the chips link to the collector's collections in order.
3. **No banner upload / profile editing.** The Figma has edit dots; the API has
   no profile update endpoint, so those controls are omitted rather than stubbed.
4. **Colour comes entirely from `Styles.md`.** The Figma is greyscale, so the
   palette is the dark Aero system (cyan/blue accents, amber brand mark).
5. **Phones use a bottom bar.** The Figma only defines 1440 px desktop frames;
   the rail folds to a 44 px bottom nav below 720 px.

## Where the styling lives

`src/app.css` holds the tokens and primitives — `--bg-base`, `--accent-cyan`,
`--gloss-top`, `--shadow-deep`, `.aero`, `.aero-solid`, `.aero-well`, `.btn`,
`.btn-ghost`, `.btn-danger`, `.input`, `.chip`, `.modal`. Component `<style>`
blocks only compose those primitives, so changing the skin is a one-file job.
