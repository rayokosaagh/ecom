# Build report & operator guide

**Ecom** — Next.js 16 · Prisma 7 · PostgreSQL 17

Everything changed in this session, why it changed, and how to run and extend it
afterwards. Every figure below was measured in a browser or a database, not
estimated.

| | |
|---|---|
| Tasks | 17 |
| New modules | 10 |
| Products | 43 |
| Tables migrated | 28 |
| Bugs fixed | 6 |

**Contents**

1. [Running it](#1-running-it)
2. [The database move](#2-the-database-move)
3. [Bugs found & fixed](#3-bugs-found--fixed)
4. [Features built](#4-features-built)
5. [Design & motion](#5-design--motion)
6. [Guides](#6-guides)
7. [Traps in this codebase](#7-traps-in-this-codebase)
8. [Reference](#8-reference)

---

## 1. Running it

This changed during the session. It is now one command, not two.

```
npm run dev
```

PostgreSQL runs as the Windows service `postgresql-x64-17` with startup type
**Automatic**, so it is already listening on 5432 before you open a terminal and
it survives reboots. You never start it. The old second terminal running
`npm run db` is gone.

`npm run db` still exists but no longer starts anything — it reports what you
are connected to, which is the first thing worth knowing when a page throws a
database error:

```
$ npm run db
✔ PostgreSQL 17.10 — database "ecom"
  postgres://postgres:***@localhost:5432/ecom
  28 tables in public
```

> **If it will not start.** `ECONNREFUSED` means the service is not running.
> Check with `Get-Service postgresql-x64-17` and start it with
> `Start-Service postgresql-x64-17` from an admin PowerShell.

---

## 2. The database move

The largest change of the session, and the one that fixed a recurring crash
rather than adding a feature.

### Why

Page renders were failing intermittently with `P1017 — Server has closed the
connection`. The mechanism is documented in your own `src/lib/prisma.ts`: the
local `prisma dev` server is PGlite, it drops idle pooled connections, and `pg`
hands out a dead socket without validating it. Your retry absorbed most of them
— 39 occurred in one dev session and you saw three — but it cannot fix a server
that is briefly unavailable.

Two things were measured. The dev server's write-ahead log had reached **3.76
GB** and was growing at ~1 MB/min with the app idle, read by nothing, with no
flag to disable it. And once the server wedged completely: a raw `pg` client got
`ECONNRESET` on every connection and it needed a hard restart.

| | Before | After |
|---|---|---|
| Stream log, unread, unbounded | 3.76 GB | gone |
| Growth rate, app idle | 965 KB/min | 0 |
| Processes to start before `npm run dev` | 1 | 0 |

### How it was moved

`pg_dump` was tried first and **hung** against PGlite — nothing written after 30
seconds. WASM Postgres does not serve it properly. The copy was done at the
Prisma level instead: `db push` to build the schema, then table by table in
foreign-key-safe order.

`Category` needed special handling: it references itself via `parentId`, so rows
went in flat and the tree was re-hung in a second pass. Every one of the 28
tables was counted on both sides afterwards and reported **ALL TABLES MATCH**.

> **Checked before moving anything.** Products were *moved* into subcategories
> rather than copied. That is only safe because `/products?category=audio`
> resolves through `getCategoryAndDescendantIds`, so a parent shelf still lists
> everything beneath it. With flat filtering, moving 17 products would have
> emptied four category pages.

### Still on disk, safe to delete

- The old instance — `npx prisma dev rm ecom-db`
- The 3.76 GB stream log, parked at
  `…\prisma-dev-nodejs\Data\durable-streams\ecom-db\_moved-aside\`
- `.env.bak-prisma-dev`

All three were left in place deliberately — moved, never deleted — so the
migration is reversible until you say otherwise.

---

## 3. Bugs found & fixed

Each of these was reproduced and measured before being changed, and re-measured
after.

### Category menu unreachable

Hovering "Peripherals" in the Products dropdown appeared to collapse the menu.
Peripherals has no children, so the fault was not its own. Five categories in a
two-column grid placed it directly under **Laptops**, which expanded inline on
hover.

| | Before | After |
|---|---|---|
| Peripherals jumps when Laptops expands | 152 px | 0 px |
| Panel size across every hovered category | — | 736×281 constant |

You aimed at it, Laptops grew and shoved it 152px down; chasing it left Laptops,
which collapsed and snapped everything back. Rebuilt as a two-panel mega menu —
fixed rail left, detail right — so nothing resizes and the bug is impossible
rather than merely unlikely. It renders three category levels.

### Brand logos invisible

Anker's and Philips' logos loaded fine and drew nothing. Their SVGs carry only a
`viewBox` — no `width`, no `height` — so they have an intrinsic *ratio* but no
intrinsic *size*. Styled with `max-height` only, CSS had no definite dimension to
resolve `width: auto` against.

| | Before | After |
|---|---|---|
| Anker & Philips rendered box | 0×0 | 60×20 |

Bellroy's SVG carries explicit dimensions and Keychron's is a PNG, which is
exactly why *some* hosted logos appeared. Setting `height` outright gives the
ratio the one dimension it needs.

> **Two wrong turns worth recording.** I first concluded the CDN URLs were dead —
> headless Chromium is bot-blocked by Brandfetch and gets a 302 to their docs
> page. Headed with a real user-agent they all return 200. I then guessed
> white-on-white artwork; measured ink brightness disproved it. **Check headed
> before concluding a third-party URL is broken.**

### Scroll-rail buttons dead

Both buttons sat stacked at the left edge, 40px apart vertically — measurably
two rects at the same x. See [Traps](#7-traps-in-this-codebase), because the
cause is a codebase-wide hazard rather than a local mistake.

### Carousel clock reset itself

Adding autoplay exposed a latent bug. The active panel is read back off
`scrollLeft`, but a smooth scroll's opening frames still round to the *old*
panel, so every advance registered as `0 → 1 → 0 → 1`. Harmless while the
carousel only moved on click; on a timer each spurious change restarted the clock
and replayed the entry animation.

```
before  gaps between advances
3.91  0.11  0.10  5.26  4.94  0.10  0.11  5.35

after
10.09  9.99  10.28      ← 10.28 is the wrap: 10s + 260ms fade
```

### Clear button left a filter on

The admin toolbar's Clear wiped the search and dropdowns but left an active
status pill, so the list stayed narrowed for no visible reason. The toolbar now
takes an `alsoClear` list of params owned by controls outside it.

### Stagger played behind an invisible section

`.stagger` starts on mount. Inside a section held at `opacity: 0` by a scroll
reveal, it ran its whole cadence unseen and was finished before anyone scrolled
to it. One rule composes the two systems instead of letting them cancel:

```css
[data-reveal="pending"] .stagger > * { animation-play-state: paused; }
```

---

## 4. Features built

### Admin navigation regrouped

Seventeen top-level rows became nine, grouped into **Catalogue**, **Sales** and
**Storefront**. Groups auto-expand when a child is the current page, so a deep
link lands with the right section already open. A group reduced to one visible
child collapses into a plain link — a customer sees "Products", not a
"Catalogue" disclosure wrapping a single row.

### Search and filters in the admin

| Page | Search | Filters |
|---|---|---|
| Products | name + slug | Category, Brand, Stock · All / Published / Draft |
| Orders | customer, email, city, country, phone, order-ref prefix | existing status pills |
| Users | name + email | All / Admin / User |

State lives in the URL, so a filtered view survives a reload, sits in a bookmark,
and pastes to a colleague. Two deliberate calls: pill counts scope to the search
but *not* to their own filter — a rail that recounted under itself would read
"Draft 0" while you stand on Published — and non-admins cannot widen their view,
because the published-only restriction is applied before the status filter.

### Drag-and-drop on every admin image field

Only the colourway rows lacked it, confirmed by dropping a real file at each
field before changing anything. Extracted to `useFileDrop`, which fixes two
defects the existing copies shared: `preventDefault` on `dragenter` as well as
`dragover`, and enter/leave *counting* so the highlight stops strobing every time
the pointer crosses a child element.

Dragging an image straight out of another browser tab now works too — that
carries an address but no file, so it previously highlighted and did nothing.

### Catalogue depth and feature filters

Most of this already existed. The category tree supports arbitrary depth, and
`SpecDefinition` + `getSpecFacets` + `SpecSidebar` is a complete facet system —
verified live before anything was written. What was missing was data.

| | Before | After |
|---|---|---|
| Subcategories | 4 | 15 |
| Products | 24 | 43 |
| Filterable feature labels | 32 | 37 |

Added: **Noise cancelling**, **Wearing style**, **Backlighting**, **Dimmable**,
**Weather resistance**. Existing definitions (`Connection`, `Bulb type`,
`Switch type`) were reused rather than duplicated — two definitions meaning the
same thing split a facet in half.

> **Still missing.** There is **no `/admin/categories`**. Categories only come
> into existence as a side effect of `upsertCategoryByName` when you save a
> product or banner, so you cannot create, rename, re-parent or delete one from
> the UI. That is why the taxonomy needed a script.

---

## 5. Design & motion

### Gradient accent words

The italic half of every two-tone heading now runs `primary → secondary` (blue
into teal). Four headings already had it; the treatment was a ten-utility class
string copy-pasted at each call site, so headings added later silently got the
plain version. It is now one class, `.accent-word`, applied to all fourteen
across five pages — which is why changing the colour later was a *one-line* edit.

> **The detail that is not decoration.** `padding-bottom: 0.25rem` is
> load-bearing. `background-clip: text` clips to the glyph box, and the serif
> italic descenders — the *p* in "picks" — hang below it. Without it they are
> sliced flat.

### Material 3 motion in the dashboard

Creating and editing already had pending states. The gap was **deleting**: rows
vanished instantly, because these lists filter optimistically and the element was
gone from the tree in the same tick it was asked to leave. `useRowExit` defers
the removal until the exit has played.

`row-exit` collapses the row's own height with `grid-template-rows: 1fr → 0fr`,
so the rows below close the gap in the same movement. A fixed `max-height` would
have to guess — guess high and the collapse starts late on short rows and never
finishes on tall ones.

Added `--ease-emphasized-accelerate` and the M3 duration scale. The accelerate
curve was previously absent on the grounds that nothing animated on the way out;
that is still true of *pages*, but not of rows.

### Scroll reveal on the home page

Five sections now rise 32px and fade over 700ms as they arrive, reusing the
existing `Reveal` component rather than a second system. The hero is untouched —
it is above the fold and already animates — and the promo banners were left alone
because they call `Reveal` internally.

> **Verified, and this one matters.** Under `prefers-reduced-motion: reduce`,
> **zero** elements carry `data-reveal`. Not "animated faster" — the attribute is
> never set, so nothing is ever hidden. This pattern hides content until
> JavaScript decides to show it, and a reduced-motion user must never be at risk
> of a blank page.

### Brand rail

Both rows now travel at one speed and hovering either stops both. Rather than
matching *durations*, the rail fixes a **speed** — 24 px/s — and derives each
row's duration from its own track width. Rows are dealt alternately, so an odd
number of brands leaves one shorter; two rows on the same duration but different
widths finish together while visibly moving at different rates.

```
row 0: duration 72s  track 3168px  →  44px moved in 2s
row 1: duration 72s  track 3168px  →  44px moved in 2s
difference: 0px
```

---

## 6. Guides

The five things you are most likely to want to do next.

### Add products

Through the UI: **Dashboard → Products → Add product**. Drag images straight onto
the image fields, or drag one out of another browser tab.

In bulk, edit the `PRODUCTS` array in `scripts/seed-products.ts`, then:

```
npm run seed:products -- --dry   # list what would be added
npm run seed:products            # apply
```

Idempotent on `slug` — a product that already exists is left entirely alone,
including edits you made in the admin. Prices are in **NPR paisa**;
`priceCents: 5200000` is Rs 52,000.

### Add a subcategory

There is no category admin yet, so this is a script. Add an entry to
`SUBCATEGORIES` in `scripts/seed-taxonomy.ts`:

```ts
{ parent: "audio", name: "Soundbars", products: ["some-product-slug"] }
```

```
npm run seed:taxonomy -- --dry
npm run seed:taxonomy
```

Products are moved, not copied. The parent shelf still lists everything beneath
it, so nothing disappears from `?category=audio`.

### Add a feature filter

A "feature" is a `SpecDefinition`. Two routes:

1. **Admin → Spec labels** creates the definition; set the value per product on
   the product form.
2. In bulk, add a block to `FEATURES` in `scripts/seed-taxonomy.ts` with a
   `values` map of value → product slugs.

Facets only appear once a category is selected, which is deliberate: labels are
shared across the catalogue, so a "Resolution" facet spanning phones and laptops
would offer 2340×1080 next to 3840×2400. Check it works at
`/products?category=audio&spec=noise-cancelling:active`.

> **Reuse before adding.** There are 37 definitions. Check whether one already
> covers your idea — `Connection` already means wired/wireless. A near-duplicate
> splits one facet into two half-empty ones.

### Add drag-and-drop to a new field

All the plumbing is in one hook:

```tsx
const { dragging, dropProps } = useFileDrop({
  onFiles: (files) => upload(files[0]),
  onUrl: onChange,   // optional: dragged from another tab
});

<div {...dropProps} className={dragging ? "…" : "…"}>
```

Omit `onUrl` where an address is no use — `BrandIconField` stores SVG markup, not
a link, so it refuses URL drags outright rather than lighting up for a drop that
could never work.

### Change the accent gradient

One place: `.accent-word` in `globals.css`. Every heading across all five pages
follows. The flash-sale panel uses the same pair and is set on the section
itself.

---

## 7. Traps in this codebase

Each of these cost real debugging time. They are properties of the codebase, not
mistakes — but they bite silently.

### `cn` does not merge classes

It is a plain joiner, deliberately — *"nothing in this codebase overrides a
utility from a parent, so conflict resolution would be dead weight."* That is no
longer quite true, and the failure mode is silent: pass two conflicting utilities
and **both** land on the element, with the stylesheet's source order deciding —
not the order you wrote them in.

> **Seen twice in one hour.** `pointer-events-none` plus a conditional
> `pointer-events-auto` shipped a button that was correctly positioned and
> completely inert. Use exactly one utility per property, chosen by the condition
> — never a base plus an override.

### Never pass a `position` utility to `IconButton`

It always applies `state-layer`, which sets `position: relative` so its `::after`
overlay has a context. Because `cn` does not merge, an `absolute` does not
replace it — and `.state-layer` is hand-written inside `@layer utilities`, emitted
*after* Tailwind's generated utilities, so `relative` wins. The button silently
stays in flow. Put the position on a wrapper, as `ScrollRail` does.

### Restart `npm run dev` after `prisma generate`

The client is bundled into the running process and Turbopack's hot reload does
not re-bundle it reliably. Symptom: `Unknown field 'x' for select statement on
model 'Y'` while the schema, the generated client and the database all clearly
agree.

### Restart after changing `DATABASE_URL` too

`lib/prisma.ts` caches the client and its pool on `globalThis` — deliberately, so
hot reloads do not open a new pool each time. Editing `.env` does not change it.
This is why the migration appeared to work while the app was still talking to the
old server.

> **A verification lesson.** I declared that migration verified on the strength of
> HTTP 200s. But `reconcileFlashSales` failing does not fail the page — the log
> shows `GET / 200` on the line after the exception. **Check that real data came
> back, not that a status code did.**

### `useSearchParams` needs a Suspense boundary on static pages

A client component calling it on a statically rendered page fails the production
build — and dev never catches it. The admin pages are `ƒ (Dynamic)` because they
read cookies for auth, so no boundary was needed; that was confirmed with a real
`npm run build` rather than assumed.

---

## 8. Reference

### New modules

| Path | Purpose |
|---|---|
| `lib/hooks/useFileDrop.ts` | Drag-and-drop plumbing for upload fields |
| `lib/hooks/useRowExit.ts` | Plays a row's exit before it is removed |
| `components/admin/ListToolbar.tsx` | Debounced URL-driven search + filter dropdowns |
| `components/admin/FilterPills.tsx` | Shared pill rail, real links |
| `components/admin/ConfirmDelete.tsx` | Inline confirm with a fade-through swap |
| `components/ui/ScrollRail.tsx` | Horizontal scroller with edge buttons and mask fade |
| `components/brands/BrandLogo.tsx` | Hosted logo with an `onError` fallback |
| `scripts/db-status.ts` | Backs `npm run db` |
| `scripts/seed-taxonomy.ts` | Subcategories and feature filters |
| `scripts/seed-products.ts` | Sample catalogue |

### Commands

| Command | Does |
|---|---|
| `npm run dev` | The whole app. Nothing else to start. |
| `npm run db` | Reports which database you are on |
| `npm run db:push` | Apply a schema edit |
| `npm run db:studio` | Browse and edit rows |
| `npm run db:seed` | **Rewrites seed data over your rows** |
| `npm run seed:taxonomy` | Subcategories + feature filters · `-- --dry` |
| `npm run seed:products` | Sample products · `-- --dry` |
| `npm run set-role` | `-- email@x.com ADMIN` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build — catches the Suspense trap above |

### Catalogue as it stands

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| Products | 43 | Spec definitions | 37 |
| Categories | 20 | Product specs | 219 |
| — of which subcategories | 15 | Product colours | 38 |
| Brands | 19 | Banners | 7 |
| Orders | 6 | FAQs | 10 |
| Users | 3 | Reviews | 2 |

### Known gaps

- **No category admin.** The single biggest gap — every taxonomy change needs a
  script.
- **Seeded spec values are inferred**, not manufacturer data. An open-back studio
  headphone gets `Noise cancelling: None` by design. Correct anything that
  matters from the product form; the seeder will not overwrite it.
- **Search and filters cover three admin pages.** Nine more lists exist; both
  components are generic, so each is roughly a `<ListToolbar>` line plus a
  `where` clause.
- `src/lib/faqs/validation.ts:50` has a pre-existing unused-arg lint warning,
  untouched.
