# Ecom

A full-stack e-commerce application — customer storefront and admin dashboard —
built with Next.js 16, React 19, Prisma 7 and PostgreSQL.

No payment provider is wired in: checkout places orders directly, which is what
a shop taking payment on delivery or in person actually needs. Adding a provider
is a change to one action, not to the model.

---

## Storefront

| | |
|---|---|
| **Catalogue** | Categories, brands, spec tables and per-product colourways. Products may carry purchasable **variants** ("16 GB / 512 GB"), each with its own price and stock — which is the row checkout actually charges and decrements. |
| **Finding things** | Full-text search, brand and category filters, price ranges, sorting, wishlist, and side-by-side compare. |
| **Cart** | Works signed out. A guest cart is claimed by the account on sign-in rather than discarded. |
| **Checkout** | Home delivery or free store pickup, discount codes, and a flat delivery rate that is free over a threshold. |
| **Sales** | Standing "was / now" pricing, plus **flash sales** — timed events that rewrite real prices when they open and restore them when they close. |
| **Reviews** | Photo and video attachments, replies and likes, with admin moderation. |
| **Orders** | Receipts, cancellation with reasons, and email confirmations at every status change. |

## Admin

| | |
|---|---|
| **Dashboard** | Revenue, orders and new customers over a rolling window, each against the period before it. |
| **Inventory** | Stock and price adjusted per stock unit. Every manual change is written to an audit ledger recording who changed what, from what, to what, and why. |
| **Orders** | Status pipeline, cancellation, and per-order fulfilment detail. |
| **Merchandising** | Featured products, promo banners, brand marks, FAQs and social links. |
| **Commerce** | Discount codes, standing sales, flash sales, spec labels, users and store settings. |

---

## Stack

- **Next.js 16** — App Router, Turbopack, Server Actions
- **React 19** · **TypeScript**
- **Prisma 7** with the `pg` driver adapter · **PostgreSQL**
- **Auth.js v5** — email/password credentials, JWT sessions. The Prisma adapter
  is wired up, so an OAuth provider is a few lines away; none is configured.
- **Tailwind CSS v4** on a Material Design 3 token system, with self-hosted
  Material Symbols (no external stylesheet request at runtime)

---

## Getting started

**Prerequisites:** Node 20+ and a local PostgreSQL 17.

```bash
# 1. Install (this also runs `prisma generate`)
npm install

# 2. Configure — create .env with at least these two:
#      DATABASE_URL="postgres://postgres:PASSWORD@localhost:5432/ecom"
#      AUTH_SECRET="..."        # generate with: npx auth secret
#    Everything else is optional in development — see the table below.

# 3. Create the schema and seed a catalogue + admin account
npm run db:push
npm run db:seed

# 4. Run
npm run dev
```

Open <http://localhost:3000>. Sign in with the `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` you set in `.env`. **Set both before seeding** — left
blank, the seeder falls back to `admin@ecom.local` / `ChangeMe123!`, which is
written in `prisma/seed.ts` and therefore public.

### Environment variables

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | **always** | `postgres://user:password@localhost:5432/ecom` |
| `AUTH_SECRET` | **always** | Signs session cookies. `npx auth secret`. Read by Auth.js itself, so it never appears as `process.env.AUTH_SECRET` in the source — it is required all the same. |
| `APP_URL` | **production** | Origin for links that leave the browser, currently password resets. Deliberately configured rather than taken from the request's `Host` header, which an attacker controls — a poisoned Host would send a real customer a genuine-looking mail pointing at someone else's server. Defaults to `http://localhost:3000` in development. |
| `SEED_ADMIN_EMAIL` `SEED_ADMIN_PASSWORD` `SEED_ADMIN_NAME` | before seeding | The first administrator. Blank falls back to the public defaults in `prisma/seed.ts`. |
| `NEXT_PUBLIC_SHOP_CURRENCY` | no | `NPR` (default) or `USD`. Must agree with what the database is denominated in — changing it is a migration, see `npm run currency`. |
| `ALLOW_PUBLIC_SIGNUP` | no | `"false"` disables `/register`. |
| `RESEND_API_KEY`&nbsp;/&nbsp;`EMAIL_FROM` | no | Leave both blank and mail is written to the server console instead of sent — the whole flow, links included, works with no provider. |
| `WHATSAPP_NUMBER` | no | Full international form, e.g. `+44 7911 123456`. Blank renders no chat buttons, which is the intended state for a shop without one. A national number with no country code cannot be detected as wrong and will produce a broken link. |
| `SHADOW_DATABASE_URL` | no | Only `prisma migrate` reads it, and this project uses `db push`. |

`.env` is git-ignored, and so is the local `.env.example` template — this table
is the reference a fresh clone reads. Keep them in step when adding a variable.

### Everyday commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint

npm run db           # is the database reachable?
npm run db:push      # apply schema changes
npm run db:seed      # seed catalogue + admin
npm run db:studio    # browse the data
npm run set-role     # promote an account to ADMIN
```

---

## Testing

There is no test runner. Instead, each piece of business logic that decides
something consequential is a **pure module** with no database or DOM import, and
each has a `check:` script that exercises it directly:

```bash
npm run check:fulfilment      # delivery vs collection, and what each charges
npm run check:price           # manual price changes, and what blocks one
npm run check:inventory       # stock adjustments and the ledger
npm run check:discounts       # code eligibility and the money off
npm run check:sales           # what counts as "on sale"
npm run check:flash           # flash-sale apply and restore
npm run check:order-email     # what a customer is told about their money
npm run check:svg             # the sanitizer guarding admin-supplied SVG
```

…and a dozen more — run `npm run` to list them. The pattern is deliberate: the
admin form, the storefront and the server action all call the same function, so
the check is asserting the contract all three depend on rather than one caller's
view of it.

---

## Notable design decisions

**Money is stored as integer minor units in the shop's own currency.** A price
of `1070000` means Rs 10,700 — there is no base currency underneath being
converted at render, because conversion produces prices nobody chose. Switching
currency is therefore a migration (`npm run currency`), not a toggle.

**Flash sales write real prices.** The cart prices a line from `priceCents`,
checkout snapshots it onto the order, and the catalogue sorts and range-filters
on it inside Postgres. A discount that existed only in a render would leave all
three quoting the old figure. Each sale snapshots what it overwrote, and skips
restoring any row an admin has since edited.

**Orders snapshot everything.** Line names, prices, variant labels and the
delivery address are copied onto the order, not referenced. Editing a product or
an address later must not rewrite what happened.

**Manual changes are ledgered; automatic ones are not.** Selling moves stock and
flash sales move prices, and neither writes to the audit ledgers — those
movements are already fully recorded as orders and price snapshots, and a second
copy is one more thing that can disagree with the first.

---

## Repository layout

```
prisma/schema.prisma   33 models, heavily commented — the best place to start
src/app/               routes: storefront, (auth), (dashboard) admin
src/components/        UI, grouped by feature
src/lib/               business logic; `lib/<feature>/` is pure, `actions/` writes
scripts/               check:* suites, seeders and one-off migrations
docs/                  development records — see docs/README.md
```

`src/generated/` is Prisma Client output and is not committed; `postinstall`
recreates it.
