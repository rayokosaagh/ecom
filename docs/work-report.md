# Work report & operating guides

Ecom storefront and admin dashboard — Next.js 16 (Turbopack), Prisma 7, PostgreSQL,
Tailwind v4 on Material Design 3 tokens.

A record of what changed, why, what was tried and rejected, and how to operate the
parts that now need operating.

At time of writing: lint clean, 213 automated checks passing. Typecheck and the
production build are red on `src/lib/social/catalogue.ts`, which is mid-refactor in a
parallel session — nothing in this report depends on it.

---

## Contents

- [Summary](#summary)
- [1 · Product slugs](#1--product-slugs-stopped-following-the-name)
- [2 · Dashboard overview](#2--dashboard-overview)
- [3 · Product card images](#3--product-card-images)
- [4 · Currency → NPR](#4--currency--nepali-rupees)
- [5 · Brand navigation](#5--brand-navigation)
- [6 · Brand logos in dark mode](#6--brand-logos-in-dark-mode)
- [7 · Inventory management](#7--inventory-management)
- [Guides & tutorials](#guides--tutorials)
  - [Switching the shop's currency](#switching-the-shops-currency)
  - [Fixing a brand logo that looks wrong in dark mode](#fixing-a-brand-logo-that-looks-wrong-in-dark-mode)
  - [Adding a brand icon (the vector kind)](#adding-a-brand-icon-the-vector-kind)
  - [After any Prisma schema change](#after-any-prisma-schema-change)
  - [Running the checks](#running-the-checks)
  - [Adding a chart to the dashboard](#adding-a-chart-to-the-dashboard)
- [Open risks](#open-risks)
- [Reference](#reference)

---

## Summary

| Work | Outcome | Verified by |
|---|---|---|
| Product slugs | Renaming a product now renames its URL. 7 of 24 stale slugs backfilled. | `slugs:products --dry-run` reports nothing to do |
| Dashboard overview | Three static counts → KPI row, revenue trend, order pipeline, top products, inventory, recent orders. Admin and customer views. | 149 checks + live query smoke test |
| Product card images | Explored uncropped options, reverted to `object-cover` on request. Behaviour unchanged; reasoning documented in place. | Build clean |
| Currency → NPR | Whole shop re-denominated at 142, rounded to Rs 100. Switching back is one command. | All 6 order receipts still balance |
| Brand navigation | New `/brands` page, two-row looping rail on the home page, scroll buttons on the catalogue filter. | Rendered HTML inspected |
| Brand logos in dark mode | Per-brand treatment setting, after three failed global rules. | 27 checks + rendered HTML matched against the database |
| Inventory management | New `/admin/inventory`: one row per thing that can run out, adjust in place, every hand-made change recorded with a reason. | 37 checks + rendered HTML as a real admin + a transaction probe against Postgres |

---

## 1 · Product slugs stopped following the name

### Cause

`src/components/products/ProductForm.tsx:98`. The form keeps the slug in step with the
name only while `slugTouched` is false, and that flag was initialised from **"is there
already a slug?"** when it needed to mean **"did a human edit the slug?"**

```ts
const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));
```

The two questions give the same answer on a new product and opposite answers on an
existing one:

- **New product** — `values.slug` is `""` → flag starts false → the slug tracks the name.
- **Edit product** — `values.slug` is always the saved slug → flag starts `true` on mount,
  before a keystroke → the sync was dead on arrival.

So it was invisible on create and total on edit — the one screen where renaming happens.

Nothing was wrong on the server. `parseProduct` already did `slugify(slugRaw || name)`;
it was faithfully saving the stale slug the form kept sending it.

### Fix

A slug only counts as hand-written when it differs from what the name would produce.
Clearing the field also hands it back to the name.

```ts
const [slugTouched, setSlugTouched] = useState(
  Boolean(values.slug) && values.slug !== slugify(values.name),
);
```

### Backfill

`scripts/backfill-product-slugs.ts` rewrites each slug from its name, keeps
already-correct ones so their URLs don't move, suffixes duplicates (`-2`, `-3`), and
skips names that slugify to nothing rather than inventing a slug.

```bash
npm run slugs:products -- --dry-run   # preview
npm run slugs:products                # apply
```

Writes go in **two passes inside one transaction**. The unique constraint isn't
deferrable, so renaming A onto B's slug fails even when B is about to move away;
parking every changing row on a staging value first makes write order irrelevant.

Seven products were renamed, e.g. `macbook-air-13-m1` → `macbook-air-13in-m1`.

> **Side effect:** those seven old `/products/<slug>` URLs now 404. If any were shared
> or indexed you'd want redirects, which the app has no table for today.

---

## 2 · Dashboard overview

`/dashboard` was three static product counts. It's now a real analytics page — and
because it's reachable by every signed-in account it has two versions: an admin sees the
shop's books, a customer sees their own, from separate queries scoped by user id.

### What's on it

- **Range filter** — 7 / 30 / 90 days, in one row above everything it scopes, as links so
  the view lives in the URL and survives a refresh or a shared link.
- **KPI row** — revenue, orders, average order, new customers. Each with a change against
  the immediately preceding window and a sparkline.
- **Revenue over time** — area and line, with the previous period in grey behind it.
  Crosshair and tooltip on hover; arrow keys / Home / End on focus.
- **Order pipeline** — pending → paid → shipped → cancelled as one stacked bar, with
  counts and percentages in the legend.
- **Top products** by revenue, **Needs attention** (published items at ≤ 5 stock, with
  out-of-stock called out by name), and **Recent orders**.

### Decisions worth knowing

**Revenue means money actually taken** — `PAID` and `SHIPPED` only. Counting pending
orders would let abandoned checkouts inflate the headline; a cancelled one is money that
came back. "Orders" counts everything, because that's what the word means. The two
disagreeing is expected and the tiles say which is which.

**No chart library.** Hand-rolled SVG marks, with axis text, tooltips and markers as HTML
beside them — so text stays real text at real sizes and strokes stay 2px at any width,
with no measure-then-render JavaScript before anything appears.

**Colours were computed, not chosen.** Validated against this app's own surfaces rather
than eyeballed. `--color-primary` (`#0b57d0`) passes as the light accent unchanged; its
dark counterpart `#a8c7fa` fails the lightness band and chroma floor — fine as a button
face, far too weak as a line — so charts carry their own dark step.

**Order status is an ordered scale**, not a set of identities, so it gets one blue hue in
three steps rather than three unrelated colours; cancelled leaves the ramp for the
reserved critical red. The ramp inverts between light and dark so "further along is more
prominent" survives the theme flip.

**Every chart carries a table twin** — a native `<details>`, so it works with JavaScript
off. The table isn't a fallback, it's the other half of the chart.

**Day bucketing happens in JS, not SQL.** `date_trunc` groups in the *database's*
timezone, so an 8pm order could land on a different day in the chart than in the order
list. The day a row belongs to is decided in exactly one place.

**Average order value is derived from the two totals**, not averaged per day — a mean of
daily means weights a quiet Tuesday the same as a busy Saturday.

### Caught by the checks

`areaPath()` defaulted its baseline height independently of `toPoints()`, so points
scaled to one plot could be closed against another — a fill that runs off the bottom of
the chart, draws without error, and looks almost right. The height is now a required
argument.

---

## 3 · Product card images

Reported as "some images appear cropped". The frame is a fixed `aspect-square` with
`object-cover`, so how much is lost depends on how far a photo's ratio is from square —
this set spans 0.67 (800×1200) to 1.78 (800×450), averaging about **32% off the long
edge**.

Two alternatives were tried and both rejected:

- **`object-contain`** — nothing cropped, but the leftover space has to go somewhere: a
  wide photo becomes a thin strip floating in a square, visibly smaller than the portrait
  beside it.
- **A blurred backdrop** filling that space with an over-scaled copy of the photo.

The card is back on `object-cover`, with the trade recorded in a comment at
`src/components/products/ProductCard.tsx` so nobody flips it again without knowing why.

> **The actual fix is at upload, not in CSS.** No `object-fit` value gives both uncropped
> and uniform. Squaring images does — pad to 1:1 on a transparent canvas, and `cover`
> crops nothing because nothing hangs over the edge. `sharp` is already in
> `node_modules` and there's an upload pipeline at `src/lib/uploads/`.

### What size to upload

| Surface | Rendered | Needs (device px) |
|---|---|---|
| Product card (widest case — 3 columns at 1023px) | ~314px box, ~290px image | ~610 |
| Product page gallery | 532px square frame | ~1064 |
| Gallery magnifier (`LENS_ZOOM = 2.6`) | 532 × 2.6 | ~1383 |

**800 × 800 square** covers the card with headroom. But the same file feeds the gallery
and there's no `srcset` (these are operator URLs, deliberately bypassing `next/image`),
so if one file must serve everything use **1600 × 1600** — otherwise the zoom, whose
entire purpose is resolution, goes soft. Format: WebP q80 or AVIF, both of which keep
alpha, which matters because the card frame deliberately has no background.

---

## 4 · Currency → Nepali rupees

The shop prices in NPR. Amounts render as **Rs 3,54,900** — Latin digits, the `Rs`
symbol, and the lakh grouping Nepal actually uses (`en-IN` number conventions;
`en-NP` would give `354,900` and `ne-NP` would give Devanagari digits).

Whole rupees show no paisa, but a fraction still displays rather than being rounded into
a lie. Dollars always show their cents.

### How it works

**Prices are stored in the shop's currency, not converted at render.** Converting at
display can only produce what arithmetic gives you — Rs 11,218.00 — when a shop wants
Rs 11,200 on the shelf. Storing what you actually charge also keeps Postgres sorting and
range-filtering correct, which is where the catalogue does both. The cost is that
switching currency is a migration rather than a toggle.

- `src/lib/money/currency.ts` holds the registry. Adding a currency is one entry: code,
  locale, decimals, price step, and its own delivery rates.
- The active currency comes from `NEXT_PUBLIC_SHOP_CURRENCY`, **not** the database,
  because `formatPrice` runs in client components (cart line, sale card, dashboard
  tooltip) that can't await a query. Its signature never changed, so all 26 call sites
  were untouched.
- Delivery moved into the currency definition — **Rs 700 flat, free at Rs 7,100** —
  because those were hardcoded `499` and `5000` and would otherwise have started charging
  Rs 4.99 for shipping.

### What was converted

Rate **142**, catalogue prices rounded to the nearest **Rs 100**.

| Table | Rows | Rule |
|---|---|---|
| Products | 24 | × 142, rounded to nearest Rs 100 |
| Product variants | 8 | same |
| Discount codes | 1 | fixed amounts only — a percentage is a ratio, not an amount |
| Orders / order lines | 6 / 7 | parts converted, totals recomputed from them |
| Flash-sale snapshots | 4 | same rule as the product price, or restores silently decline |

**Receipts still add up.** Converting total, shipping, discount and line prices
independently would let rounding pull them apart, so a past receipt stops matching its
own lines. Instead the parts are converted and each total is recomputed. Verified: all
six orders satisfy `goods + delivery − discount = total`.

**It refuses to run twice.** `StoreSettings.currency` records what the stored integers
already mean. The script asserts it matches `--from` and advances it in the same
transaction as the prices, so a repeat exits 1 rather than multiplying every price by 142
again. Verified by running it twice.

**Prose doesn't convert itself.** Two live rows quoted dollars and were fixed by hand —
the delivery FAQ and a promo banner. Any new copy quoting an amount needs the same
treatment on a future switch.

**The seed is now NPR** — 23 price literals converted, the delivery FAQ rewritten, and it
sets `StoreSettings.currency = "NPR"` before writing anything. Otherwise a fresh seed
would hold rupees while claiming dollars, and the first conversion would double up.

---

## 5 · Brand navigation

- **Product counts removed** from the brand tiles. The count is still queried — it's what
  orders the strip, deepest catalogue first — just no longer returned or rendered.
- **New `/brands` page** listing every brand with at least one published product. Reached
  from "All brands" on the home strip and from the footer's Shop column.
- **`BrandTile` extracted** so the home strip and the full listing can't drift apart.
- **`BRAND_LIMIT` 12 → 18**, so the front door reaches every brand you currently carry.
- **The home strip is two looping rows**, travelling right to left. Durations are derived
  from a fixed pixels-per-second speed, so rows of different lengths still move at the
  same rate rather than finishing together at visibly different speeds.
- **Scroll buttons on the catalogue's brand bar** (`src/components/ui/ScrollRail.tsx`).
  That rail hides its scrollbar, which also removed the only sign it moves — fine on a
  trackpad or touchscreen, stuck on a plain mouse.

### Details that matter

- The rail loops by rendering **two identical halves** and sliding exactly one half-width
  (`-50%`), so there's no seam to hide — nothing moved. Each half repeats the list enough
  times to exceed the viewport, or a gap opens at the tail on a small catalogue.
- It pauses on hover **and** `focus-within`. A link that slides out from under the cursor
  can't be clicked, and tabbing into a moving rail would chase focus off screen.
- The duplicate half is `aria-hidden` and `inert`, or every brand is announced twice and
  tabbing visits 18 links to 9 brands.
- The global reduced-motion rule sets `animation-duration: 0.01ms !important`, which
  doesn't stop a marquee — it *completes* it, parking the track at `-50%` with half the
  brands scrolled off and unreachable. The rail overrides it to no animation at all and
  becomes an ordinary horizontal scroller.
- Scroll buttons appear only when the row actually overflows, and a `ResizeObserver`
  watches the scroller **and its children** — filtering changes content width without
  changing the container's.

---

## 6 · Brand logos in dark mode

This took four attempts. A hosted logo is fixed artwork — nothing in CSS can recolour it
— and which treatment it needs depends on how the mark is drawn, which nothing in the URL
or the file type reveals. Three global rules were tried and each broke a different brand.

### What was tried and rejected

| Approach | Why it failed |
|---|---|
| A light plate in dark mode | Preserved colour and was legible, but only existed on the home tiles — the catalogue filter bar and product cards still showed dark logos on dark. |
| Swapping the CDN URL per theme | Works until a brand's asset is named by id (`/theme/dark/idEPzHEXKA.svg`). Anker's derived address 404s, so it silently kept the dark artwork. Also shipped inverted once, turning every logo white on the white page. |
| A global white filter | `brightness(0) invert(1)` flattens every opaque pixel to white. Perfect for a single-colour wordmark; it turned IKEA and JBL — filled shapes with lettering — into solid blocks. |

### What it does now

`Brand.logoTreatment`, set per brand from `/admin/brands`, because the choice needs eyes
on the artwork.

| Setting | Effect in dark mode | Use for |
|---|---|---|
| `AUTO` *(default)* | Silhouette if the file has transparency, chip if not | Most marks |
| `INVERT` | Repaint white | Single-colour wordmarks |
| `PLATE` | Keep colours on a light chip | Opaque artwork; anything the filter would flatten |
| `NONE` | Leave alone | Colourful marks that already read on dark |
| `VARIANT` | Load the CDN's dark-background file **and** silhouette it | Filled marks with knocked-out lettering |

`VARIANT` applies the filter on top of the swap because the publisher's "for dark
backgrounds" file isn't always white — IKEA's keeps its yellow lettering — and repainting
already-white artwork white changes nothing.

### Current settings

| Brand | Setting | Why |
|---|---|---|
| JBL, IKEA | `VARIANT` | Filled marks; the filter alone made them blocks |
| Audio Technica | `PLATE` | Opaque `.jpeg`, can't be silhouetted |
| Anker, Bellroy, BenQ, Keychron, Logitech, Osprey, Philips, Razer | `AUTO` | Resolve to the filter, which works |
| Apple, ASUS, Dell, LG, Peak Design, Sennheiser, Sony | — | Have `iconSvg`; take `currentColor` and need none of this |

**Structural fix:** the chip is rendered inside `BrandLogo`, so the treatment travels with
the logo to all nine places `BrandMark` appears. Getting that wrong was the original bug —
and it recurred once mid-session, when the setting was plumbed into only two of them and
IKEA rendered correctly on the brand strip and wrongly on product cards on the same page.

---

## 7 · Inventory management

Stock was editable, but only one product at a time, buried in a form built for names,
descriptions and images. Nothing showed what was running out without reading every
product, and nothing recorded that a level had been changed by hand — a figure that
disagreed with the shelf had no history to explain it.

`/admin/inventory` is the worklist that was missing, and `/admin/inventory/history` is
the record.

### The unit is a line, not a product

The page lists **stock units**: a product with no variants is one row, a product with
variants is one row per variant and none of its own. That is not a display choice — it is
the rule checkout claims stock by and cancellation restores it by, so a page that listed
products would offer to restock a number nothing sells from. A MacBook Air sold in three
configurations is three rows here and one row on `/dashboard/products`.

Rows sort emptiest first and stay that way; there is no sort control, because there is
only one order a worklist wants.

### Adjusting

Three modes, and the third is the one that matters:

| Mode | Means | For |
|---|---|---|
| Add | `stock + n` | A delivery arrived while the shop kept selling |
| Remove | `stock − n` | Breakage, loss |
| **Set** | `stock = n` | A recount — the person holding the shelf knows there are 12 |

Making someone convert "there are 12" into "remove 3" is how the wrong figure gets saved,
and doing the arithmetic by hand while the shop is still selling is a race with itself.

Two refusals are deliberate:

- **Removing more than exists fails** rather than clamping to zero. A clamp records a
  delta that never happened and quietly agrees with a count already shown to be wrong.
  The error says to recount and set the counted figure instead.
- **A change of nothing fails.** "Set to 12" when it is already 12 would write a history
  row saying stock changed when it did not, and a ledger that logs non-events is one
  nobody reads.

The preview line under the amount (`12 → 52 (+40)`) is not an optimistic guess: the form
and the server action both call `planAdjustment` in `lib/inventory/stock`, so what is
shown is the calculation that will run.

### The concurrency guard

The level is re-read **inside** the transaction and the update is conditional on it not
having moved — the same pattern order transitions and discount redemptions use. A shop
selling while an admin types is the ordinary case, not a rare one: without it, a form
opened at 3 in stock would write "3 + 40 = 43" over a level that had since sold to 1, and
invent two units. Losing the race reports it and asks for a reload rather than retrying,
because the right new figure depends on what the other change was.

### What the history is, and is not

`StockAdjustment` records **only the manual changes**: what moved, by how much, why, who,
and the level either side. Selling and cancelling move stock too and are deliberately not
written here — those movements are already recorded in full as orders, and a second copy
in another table is one more thing that can disagree with the first.

It follows that consecutive rows for one line are not a continuous series: sales in
between are why one row's `stockAfter` need not equal the next row's `stockBefore`. Both
levels are stored anyway so a row reads years later without replaying every order ever
placed.

Reasons are offered by direction — a delivery cannot reduce stock and damage cannot
increase it — so the ledger cannot hold "removed 5 · delivery received". `RECOUNT` and
`OTHER` belong to both, because a count can land either side of what was recorded.

### Caught by the checks

`check:inventory` fuzzes every mode against a spread of levels and amounts, and asserts
that anything `planAdjustment` accepts is in range, changes something, and has a delta
that adds up. It also asserts every reason in the schema is offered somewhere — a reason
added to the enum but not to a direction list would otherwise be unreachable in the UI
with nothing failing.

### Also caught, during this work

The first render of the page failed with `Cannot read properties of undefined (reading
'count')` on `prisma.stockAdjustment` — the exact symptom the
[After any Prisma schema change](#after-any-prisma-schema-change) guide describes. The
dev server was holding a cached copy of the generated client from before the model
existed. Deleting `.next` and restarting fixed it, which is the part of that guide people
skip.

---

# Guides & tutorials

## Switching the shop's currency

Prices are stored in the shop's currency, so this is a data migration. It is safe to
rehearse, and it cannot be run twice by accident.

**1. Rehearse it.** The rate is how many units of the target currency one unit of the
source buys. There is no default, deliberately — a baked-in exchange rate goes stale
silently.

```bash
npm run currency -- --from NPR --to USD --rate 0.00704 --dry-run
```

Read the table it prints. Confirm the rounding produces shelf prices rather than
arithmetic.

**2. Apply it.** Same command without the flag. Everything happens in one transaction,
including advancing the ledger column.

```bash
npm run currency -- --from NPR --to USD --rate 0.00704
```

**3. Point the app at it** in `.env`, then restart. If these two disagree, every price
renders with the wrong symbol.

```bash
NEXT_PUBLIC_SHOP_CURRENCY="USD"
```

**4. Fix the prose by hand.** Amounts written into copy are not converted. Check the
delivery FAQ at `/admin/faqs` and any banner subtext at `/admin/banners`.

### Adding a currency that isn't NPR or USD

One entry in `CURRENCIES` in `src/lib/money/currency.ts`:

```ts
EUR: {
  code: "EUR",
  name: "Euro",
  locale: "de-DE",
  minorUnits: 100,
  minFractionDigits: 2,
  maxFractionDigits: 2,
  priceStepMinor: 100,        // what "a round price" means here
  flatShippingMinor: 499,
  freeShippingOverMinor: 5_000,
},
```

Then add the code to `isCurrencyCode` and you can convert into it.

---

## Fixing a brand logo that looks wrong in dark mode

No code needed. Diagnose from what you see, then pick the setting.

**1. Look at it in dark mode** and match the symptom:

| What you see | Set it to |
|---|---|
| Invisible — dark mark on a dark plate | `INVERT` |
| A solid white block, no lettering | `VARIANT`, or `PLATE` if that fails |
| A solid white rectangle including its background | `PLATE` — the file is opaque |
| Fine already, but being altered | `NONE` |

**2. Open the brand** at `/admin/brands` → edit → **On dark backgrounds**. The control
only appears once there's an image address.

**3. Save and check both themes.** Light mode is never altered by any of these settings,
so you're only ever judging dark.

> **Better than all of them:** give the brand an `iconSvg` instead — see the next guide.
> It takes `currentColor`, so one asset works on every surface in both themes and none of
> this applies.

---

## Adding a brand icon (the vector kind)

An `iconSvg` is inlined markup that inherits the page's colour. It's the only brand
artwork that needs no dark-mode treatment at all.

**1. Try the importer first.** Add the brand to the slug map in
`scripts/import-brand-icons.ts` — the name as it appears in your database, mapped to its
slug on [simpleicons.org](https://simpleicons.org):

```ts
const SIMPLE_ICONS: Record<string, string> = {
  ASUS: "asus",
  Muuto: "muuto",
  Osprey: "osprey",
};
```

```bash
npm run brands:icons              # only brands with no mark yet
npm run brands:icons -- --force   # re-fetch and overwrite
```

The map is hand-written on purpose: Simple Icons' slugs don't always match the name
("Peak Design" is `peakdesign`), and a wrong slug puts another company's logo beside your
products. Everything fetched goes through the sanitizer before storage.

**2. Or paste it by hand** at `/admin/brands` → edit → the mark field. Good sources, in
order: simpleicons.org, the brand's own press kit (`/press`, `/brand`, `/media-kit`),
Wikimedia Commons.

**3. Clean the markup before pasting.** Two things silently ruin a logo here:

- **Hardcoded fills.** `BrandIcon` sets `fill-current` on the root and `fill` inherits —
  but only to children that don't set their own. A path carrying `fill="#000000"` keeps
  it and stays black on dark. Delete the attribute.
- **`<style>` blocks.** Illustrator and Figma export colour as CSS classes
  (`.cls-1{fill:#1d1d1b}`). The sanitizer drops both `<style>` and `class` — both are
  injection vectors — so the mark arrives with no colour information. That's the right
  outcome for a monochrome mark; convert the classes to `fill` attributes for a
  multi-colour one.

Also silently dropped: `<script>`, `<use>`, `<image>`, `<animate>`, `<foreignObject>`,
`<metadata>`, and `style=`. **Keep the `viewBox`** — without it the mark has a ratio but
no intrinsic size and lays out at 0×0. Limits are 256 KB submitted, 64 KB stored.

**4. Check the preview.** It renders the *sanitized* result, not a lookalike — if the
preview looks wrong, the markup is wrong.

---

## After any Prisma schema change

This cost three round trips in one session. `src/generated/prisma` lives under `src/`, so
Turbopack caches it like ordinary application source — but it's a generated artifact that
changes outside the edit cycle. A plain restart recompiles your code against the *cached*
old client, and the failure looks exactly like a code bug.

**1.** Edit `prisma/schema.prisma`.

**2.** Push and regenerate:

```bash
npm run db:push
npx prisma generate
```

**3.** Stop the dev server, delete the cache, restart. All three — the delete is the part
people skip:

```bash
rm -rf .next && npm run dev
```

> **Symptom if you skip it:**
> `PrismaClientValidationError: Unknown field ... Available options are marked with ?`
> — while a fresh `tsx` script runs the identical query fine. That mismatch is the tell:
> the on-disk client is correct and the server is holding a cached copy.

> **Also:** stopping the npm wrapper can orphan the Next process, which keeps port 3000
> and carries on serving stale modules while your "fresh" server lands on 3001. If the
> port is taken, find and kill the orphan before restarting.

---

## Running the checks

All pure logic — no database, no browser. They exist because a wrong dashboard is
believed, and a wrong logo mapping typechecks.

```bash
npm run check:dashboard      # 149 — period maths, bucketing, deltas, axes, geometry
npm run check:brand-logos    #  27 — logo treatment resolution and URL swapping
npm run check:inventory      #  37 — stock states, adjustment arithmetic, reason lists
npm run typecheck
npm run lint
```

`check:dashboard` also statically renders the chart components and asserts on the real
DOM: that stacked segments sum to exactly 100%, that no `NaN` or `Infinity` reaches a
style attribute or path, and that a brand-new shop with a single all-zero day still
draws.

### Adding a case

Both scripts use the same two helpers. The convention is to phrase the label as the thing
that must stay true, not the function being called:

```ts
check("a fall to zero is -100%", delta(0, 400)?.ratio === -1);
equal("AUTO plates opaque artwork",
  resolveLogoTreatment(LogoTreatment.AUTO, JPEG), "plate");
```

---

## Adding a chart to the dashboard

The primitives are in `src/components/charts/`. Reuse them rather than reaching for a
library — the conventions below are what keep the page coherent.

**1. Get the numbers** in `src/lib/dashboard/metrics.ts`, inside the existing
`Promise.all`. Take `now` as a parameter so the page can be rendered against a fixed
clock in a test.

**2. Pick the form by the job.** One value with a direction is a `StatTile`, not a
one-bar chart. Ranked magnitudes are `BarList`. Part-to-whole is `StackedBar`. Change
over time is `TrendChart`.

**3. Wrap it in `ChartCard`** and give it a table.

```tsx
<ChartCard
  title="New customers"
  description="Accounts created in this period."
  table={{
    caption: "New customers by day",
    columns: ["Day", "Customers"],
    rows: data.days.map((d, i) => [
      formatDayFull(d),
      String(data.customers.series[i] ?? 0),
    ]),
  }}
>
  <TrendChart
    points={trendPoints(data.days, data.customers.series)}
    comparison={data.customers.previousSeries}
    format="count"
    seriesLabel="New customers"
  />
</ChartCard>
```

**4. Use the chart tokens** — `--color-chart-accent`, `--color-chart-muted`,
`--color-chart-grid`, the three ordinal steps, and `--color-chart-critical`. Don't
introduce a new hue; the set was validated against both surfaces.

**5. Never a second y-axis.** Two measures of different scale are two charts.

---

# Open risks

### High — Brandfetch client id

Every hosted logo URL carries `?c=…`, a Logo Link client id that Brandfetch gates by
referring domain. Fetched server-side, those URLs return Brandfetch's own HTML page
(375,880 bytes, identical for every brand) rather than an image.

It may work from a browser on localhost and fail from a deployed domain that isn't
registered, or if the id is rotated. If that happens **all eleven hosted logos break at
once**, in production, and you'll see initials where marks should be.

**Do:** confirm in devtools that those requests return `image/svg+xml`; register the
production domain with Brandfetch; or download the eleven files into `public/uploads/`
and own them.

### Medium — a promo banner makes a false claim

"Campus Ready Laptops — Starting at Rs 85,100", but the cheapest student laptop is
**Rs 1,13,500**. The claim was already false before the currency conversion ($599 against
a $799 floor); it was converted faithfully rather than rewritten.

**Do:** edit the subtext at `/admin/banners`.

### Medium — new brands default to `AUTO`

A filled-shape logo silhouettes into a white block until somebody looks at the site.
Nothing detects it, and nothing can — the information isn't in the URL or the file type.

**Do:** check new brands in dark mode; the setting is a dropdown.

### Medium — images aren't squared at upload

Cards keep centre-cropping non-square photos, ~32% off the long edge on this set.

**Do:** normalize to 1:1 in `src/lib/uploads/` with `sharp`.

### Low — `AUTO` misreads an opaque PNG

The heuristic is extension-only (`.jpg`/`.jpeg` means no alpha). A PNG with a baked-in
white background passes as transparent, gets inverted, and becomes a white block.

**Do:** set that brand to `PLATE`.

### Not risks

Light mode applies no logo treatment at all, so nothing in section 6 can damage the page
most visitors see. And `VARIANT` degrades rather than breaks — a URL naming no theme
resolves to `none`, and a 404 on the derived file falls back to the stored one.

---

# Reference

## Commands added

| Command | Does |
|---|---|
| `npm run slugs:products` | Rewrite product slugs from names. `-- --dry-run` to preview. |
| `npm run currency` | Re-denominate every price. Needs `--from --to --rate`. |
| `npm run check:dashboard` | 149 checks over dashboard maths and chart rendering. |
| `npm run check:brand-logos` | 27 checks over logo treatment resolution. |
| `npm run check:inventory` | 37 checks over stock classification and adjustment arithmetic. |

## Files added

| Area | Files |
|---|---|
| Dashboard data | `src/lib/dashboard/range.ts`, `metrics.ts` |
| Charts | `src/components/charts/` — `geometry.ts`, `ChartCard.tsx`, `TrendChart.tsx`, `Sparkline.tsx`, `BarList.tsx`, `StackedBar.tsx` |
| Dashboard UI | `src/components/dashboard/` — `StatTile.tsx`, `RecentOrders.tsx`, `InventoryCard.tsx`, `pipeline.ts` |
| Money | `src/lib/money/currency.ts` |
| Brands | `src/lib/brands/logo-format.ts`, `src/components/brands/BrandTile.tsx`, `src/app/brands/page.tsx` |
| Shared UI | `src/components/ui/ScrollRail.tsx` |
| Inventory | `src/lib/inventory/` — `stock.ts` (pure rules), `service.ts` (reads); `src/lib/actions/inventory.ts` (the one write) |
| Inventory UI | `src/components/inventory/` — `AdjustStock.tsx`, `StockBadge.tsx`, `AdjustmentList.tsx`; `src/app/(dashboard)/admin/inventory/` — `page.tsx`, `history/page.tsx` |
| Scripts | `scripts/` — `backfill-product-slugs.ts`, `convert-currency.ts`, `check-dashboard.ts`, `check-brand-logos.ts`, `check-inventory.ts` |

## Schema changes

- **`StoreSettings.currency`** — the ledger recording what the stored money integers
  mean. Defaults to `USD`, which is what every row held before it existed. Its only job
  is to make the conversion script refuse to run twice.
- **`Brand.logoTreatment`** — enum `LogoTreatment { AUTO INVERT PLATE NONE VARIANT }`,
  default `AUTO`.
- **`StockAdjustment`** — one row per stock change made by hand: `delta`, `stockBefore`,
  `stockAfter`, `reason`, optional `note`, the product and (when the units live there)
  the variant, and who made it. `userId` is nullable and `SetNull` — deleting an admin
  must not delete the record that stock was changed, only who by. Sales and cancellations
  are *not* written here; see [§7](#7--inventory-management).
- **`StockChangeReason`** — enum `{ RECEIVED RECOUNT DAMAGED LOST RETURNED OTHER }`.
  Required on every adjustment.

## Environment

```bash
NEXT_PUBLIC_SHOP_CURRENCY="NPR"   # NPR | USD. Defaults to NPR when unset.
```

## Design tokens added

In `src/app/globals.css`, alongside the existing Material 3 scheme:

- `--color-chart-accent`, `--color-chart-muted`, `--color-chart-grid`
- `--color-chart-step-1/2/3` — the ordinal ramp for order status, which inverts between
  themes so step 1 is always the one nearest the surface
- `--color-chart-critical`, `--color-chart-up`, `--color-chart-down` — reserved for
  state, never for a series, and always shipped with an icon or a sign

Plus utilities: `.brand-logo-invert`, `.brand-logo-chip`, `.brand-logo-light` /
`.brand-logo-dark`, `.brand-rail` / `.brand-rail-viewport`.
