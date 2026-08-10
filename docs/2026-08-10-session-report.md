# Session report — 10 August 2026

Ecom storefront and admin dashboard. Next.js 16 (Turbopack), Prisma 7, PostgreSQL 17,
Tailwind v4 on Material Design 3 tokens.

Two agent sessions worked this repository at the same time — one on payments, checkout
and social links, one on inventory, storefront readability and the abandoned-payment bug.
There was no shared task list between them; the only evidence each had of the other was
files changing underfoot. This report merges both streams into one account: what shipped,
why it is built the way it is, what is worth reusing, and what is still open.

Companion documents: [`work-report.md`](./work-report.md) is the long-form history with
per-feature reasoning; [`BUILD-REPORT.md`](./BUILD-REPORT.md) is the operator guide.

**Status at the time of writing:** `typecheck`, `lint` and the production build are clean.
972 automated checks pass across 22 `check:*` suites.

---

## At a glance

| Area | What shipped | Lives in | Verified by |
|---|---|---|---|
| Wallet payments | eSewa, Khalti and connectIPS, each verified server-to-server rather than from the redirect | `src/lib/payments/`, `src/app/api/payments/*` | `check:payments` — 152 |
| Collection orders | Pickup as a first-class fulfilment method: no address, no delivery charge, receipts reworded | `src/lib/checkout/fulfilment.ts` | `check:fulfilment` — 36 |
| **Abandoned payments** | Cancelling at the wallet now unwinds the order and refills the basket; unpaid orders release stock after 30 minutes | `src/lib/payments/abandon.ts`, `expiry.ts` | 46 new checks + end-to-end against Postgres |
| Inventory management | `/admin/inventory` — one row per thing that can run out, adjust in place, every change recorded with a reason | `src/lib/inventory/`, `src/components/inventory/` | `check:inventory` — 37 |
| Price control | Prices editable from the same page, with the same preview-and-ledger shape as stock | `src/lib/inventory/price.ts` | `check:price` — 33 |
| Social links | Trimmed platform list plus a `CUSTOM` link carrying its own mark, name and hover colour | `src/lib/social/` | `check:social` — 97 |
| Spec readability | The specifications block on a product page rebuilt around how the real data actually reads | `src/components/products/SpecTable.tsx` | Rendered against real products |

---

## 1 · Payments, end to end

Three Nepali gateways, each integrated on its own terms rather than behind a
lowest-common-denominator wrapper:

- **Khalti** is started server-side — `initiate` mints a `pidx`, which is stored on the
  order before the redirect, so a customer who pays faster than that write lands cannot
  come back to an order nothing can match.
- **eSewa** wants a signed browser form POST, so the form is rendered already signed and
  submitted on arrival. There is no server-side start and no URL to redirect to.
- **connectIPS** is a form POST signed with an RSA private key from a merchant
  certificate, validated afterwards over HTTP Basic auth.

### The rule that governs all three

**A redirect is a notification that something happened; the gateway's own API is the only
thing that says what.** Khalti's return URL carries `status=Completed` in a query string
anyone can type, so only the `pidx` is taken from it. eSewa's redirect *is* signed and the
signature is verified locally — and the status API is still called, because a valid
signature proves eSewa produced the blob, not that the blob is fresh. The same URL
replayed a week later still verifies.

Three things are checked before any order is marked paid: that we started this payment,
that the gateway says it completed, and that the amount matches. An order settled for less
than it costs is a loss nobody notices.

### `settleOrderPaid` is the only way an order becomes PAID

Idempotent by construction: the write is conditional on the order still being `PENDING`,
and Postgres decides that, not the process. Two callbacks racing on two connections cannot
both win, so a refresh, a back button or a forwarded link cannot send a second
confirmation email.

---

## 2 · Collection orders

`FulfilmentMethod { DELIVERY, PICKUP }`, chosen once at checkout, deciding three things
that would otherwise each need a flag: whether an address is collected, whether delivery
is charged, and what `SHIPPED` is called on the receipt.

**The decision worth knowing:** there is deliberately no `COLLECTED` order status. The
status records the shop's obligation being discharged, which is one idea whichever way the
goods travelled — splitting it would have forked `REVENUE_STATUSES`, the dashboard
pipeline, review eligibility and every transition table to record something the fulfilment
column already says. `fulfilmentLabels` renames it at the surface instead.

Collection is free *unconditionally*, not "free because the basket cleared the threshold" —
nothing is being carried, so there is no charge to waive. `deliveryChargeFor` is pure and
shared, so the summary re-totals as the radio is clicked and the server reaches the
identical figure when it is submitted.

Store-level settings: `pickupEnabled`, `pickupAddress`, `pickupHours`.

---

## 3 · The reported bug: "the product just disappears from the cart"

**Reported as:** check out, go to the payment portal, cancel or fail to pay, and the
product vanishes from the cart.

### What was actually happening

Not a lost cart. A wallet order is placed *before* it is paid: `checkout()` creates it
`PENDING`, claims its stock, empties the basket, and only then hands the shopper to the
gateway. That ordering is right and was kept — it gives the callback something to settle,
and stops two shoppers being sent off to pay for the same last unit.

What was missing was everything after *"and then they press Cancel"*. The order survived
with a **Pay with …** button on its receipt, but the basket was empty, `/cart` explained
nothing, and a shopper who closed the tab at the gateway had no signpost at all. The order
then held its stock for ever, because nothing in the system ever moved a `PENDING` order
on.

### What it does now

- **An explicit cancel or final failure unwinds the order.** One transaction cancels it
  (`PAYMENT_FAILED`), returns the units to whichever row they were claimed from, puts the
  lines back in the basket and restores the discount code. The shopper lands on `/cart`
  with their things in front of them under a banner saying nothing was charged.
- **Unpaid wallet orders release their stock after 30 minutes**
  (`UNPAID_ORDER_TIMEOUT_MINUTES`), with a notification to the customer. Swept lazily on
  `/cart`, `/checkout` and `/admin/inventory` — the pages about to quote or act on stock —
  the same shape as `reconcileFlashSales`, because this project has no cron.

### The three guards that make it safe

1. **Only a *final* failure unwinds anything.** `paymentWasAbandoned` is four codes:
   `cancelled` (ours, from eSewa's failure URL), eSewa's `CANCELED`, and Khalti's
   `User canceled` and `Expired`. Anything that may still settle — `Pending`, `Initiated`,
   or `unverified`, which means we could not reach the gateway to ask — keeps the order.
   Cancelling those would be guessing with somebody's money, and the guess would sell the
   units to somebody else.
2. **The unwind and the settle cannot both win.** Both are conditional updates from
   `PENDING`; whoever arrives second matches nothing and rolls back.
3. **A payment that lands after a sweep is not called success.** The timeout newly makes
   that possible, so `settleOrderPaid` gained a `not-payable` result and the customer is
   told plainly that money moved against a cancelled order and not to pay twice — instead
   of the cheerful "Payment received" the old code would have shown.

The basket is refilled with `skipDuplicates`, so a shopper who gave up and re-added the
same item by hand ends up with one of it, not three.

### The second bug, found while testing this one

`/api/payments/*` was **behind the login wall**. The proxy's redirect keeps only the
pathname, so a callback bounced to `/login` arrived stripped of the `data` blob or `pidx`
that says what happened — the payment was then neither settled nor unwound.

A session cookie is normally sent on the way back from a wallet, which is why this had not
been seen. "Normally" does not cover an expired session, a wallet's in-app browser, or
paying on a second device, and each of those silently lost a **real payment**. The
callbacks authenticate by gateway signature and server-to-server lookup and never read the
session, so opening the prefix gives nothing away.

---

## 4 · Inventory management

`/admin/inventory`, plus `/admin/inventory/history`.

**The unit is a line, not a product.** A product with no variants is one row; a product
with variants is one row per variant and none of its own. That is not presentation — it is
the rule checkout claims stock by and cancellation returns it by. A page listing products
would offer to restock a number nothing sells from. Rows sort emptiest first and stay that
way; there is no sort control, because a worklist wants one order.

### Stock

Three modes, and the third is the point: **Add**, **Remove**, and **Set**. A recount is not
an arithmetic problem — the person holding the shelf knows there are 12, and making them
work out that 12 is "remove 3" is how the wrong number gets saved.

Two refusals are deliberate. Removing more than exists **fails rather than clamping to
zero**: a clamp records a delta that never happened and quietly agrees with a count already
shown to be wrong. A change of nothing also fails — a ledger that logs non-events is one
nobody reads.

The preview (`12 → 52 (+40)`) is not optimistic: the form and the server action both call
`planAdjustment`, so what is shown is the calculation that will run.

### Price

The parallel session extended the page with price editing in the same shape — a pure
`planPriceChange` shared by preview and action, and a `PriceChange` ledger beside
`StockAdjustment`. What makes price harder than stock is what it is entangled with: a
standing "was" price that has to stay above it, and a live flash sale that already owns the
column. Both are refusals rather than silent corrections, because only the admin knows what
they meant.

### The ledgers

`StockAdjustment` and `PriceChange` record **both sides of the movement**, not a delta: a
delta cannot be read back later without replaying everything before it. Both are
deliberately *manual changes only* — selling and cancelling move stock inside their own
transactions and are already recorded in full as orders, and a second copy in another
table is one more thing that can disagree with the first.

Adjustment reasons are offered **by direction**, so the history cannot hold "removed 5 ·
delivery received". `check:inventory` asserts every reason in the schema is reachable, so a
new enum member cannot become unofferable with nothing failing.

---

## 5 · Social links

The platform list was **trimmed rather than extended**, and a `CUSTOM` member added that
carries its own name, its own pasted mark and its own hover colour. A built-in member per
network was worse in both directions: it could not cover the long tail without a migration,
and it filled the dropdown with logos for accounts nobody had.

Two details worth keeping:

- **Hosts are checked, not trusted.** The icon is a claim about where the link goes, and a
  YouTube mark on an address that is not YouTube is the one failure a shopper cannot check
  before clicking — as likely a paste into the wrong row as anything malicious.
- **`hoverColor` stores an override, not a copy.** Null means "whatever the catalogue says
  this platform's colour is", so a shop that never opens the picker gets Instagram pink for
  free, and a brand refreshing its colour carries every link that never overrode it.

A custom mark is admin-authored SVG inlined into the home page, so it goes through the same
sanitizer that guards `Brand.iconSvg` — and renders through the single component in the
codebase that inlines admin SVG.

---

## 6 · Specification readability

The specs block on `/products/[slug]` was rebuilt around what the catalogue actually holds:
43 products, up to 14 specs across 8 groups, labels never longer than 18 characters — but a
handful of values running to 78.

- **Prose values get the whole row.** Anything over 40 characters stacks label-over-value at
  full width. `"MagSafe charger, Apple Watch charger, Qi-certified wireless chargers, or
  USB-C"` was wrapping to five ragged lines beside a one-line label.
- **Headings are readable text**, not micro-caps at `0.18em` tracking — they are what a
  reader scans to find a section.
- **Label column 11rem → 9rem.** The extra was reserved for nothing and taken straight out
  of the value beside it.
- **No truncation in the headline tiles.** "Operating system" was clipping to "Operating
  sys…", losing the only thing naming the value.

---

## 7 · Principles this codebase runs on

Worth knowing before adding anything, because they are consistent and they are load-bearing:

1. **Money and stock live on the row that actually sells.** A variant owns its own price and
   stock; a product with no variants owns its own. Cart, checkout, cancellation, inventory
   and the ledgers all follow that same rule, so no two of them can disagree.
2. **Conditional updates are the concurrency primitive.** `updateMany` with the current
   value in the `where` clause, and `count === 0` means somebody got there first. Used for
   order transitions, discount redemptions, stock adjustments, payment settlement and the
   unwind. Losing the race is *reported*, never retried, because the right new value
   depends on what the other change was.
3. **One pure module and one check script per feature.** No database, no browser. The form
   and the server action call the same function, so a preview is the calculation that will
   run rather than a guess at it.
4. **Refuse rather than silently correct.** Removing more stock than exists, a "was" price
   below the price, a price change on a row a flash sale owns — each is an error with a
   sentence saying what to do instead.
5. **Snapshot what a receipt has to keep saying.** Order lines carry the price, name,
   colour and variant label as they were, so later edits cannot rewrite history.
6. **Prose comments carry the *why*, especially the rejected alternatives.** Several of the
   most valuable notes in the codebase explain what was tried and why it was wrong.

---

## 8 · Traps hit this session

Practical, and each cost real time:

- **A cached Prisma client survives a restart.** Twice, a page failed with
  `Cannot read properties of undefined` or `Unknown field` immediately after a schema
  change, while a fresh `tsx` script ran the identical query fine. `src/generated/prisma`
  lives under `src/`, so Turbopack caches it like ordinary source. The fix is the one
  people skip: **stop the server, `rm -rf .next`, restart** — not just restart.
- **`db push` refuses a required column on a populated table.** Adding `Order.updatedAt`
  offered only `--force-reset`, which destroys data. Giving it `@default(now())` alongside
  `@updatedAt` makes it backfill instead. Never take the reset.
- **Postgres `now()` is not UTC here.** The server runs at +05:45 while Prisma stores UTC
  into `timestamp` columns, so backdating a row with `now() - interval '1 hour'` lands in
  the *future*. Compute timestamps in JS and bind them.
- **Two agents, one schema file, one database.** `prisma db push` applies whatever is in
  `schema.prisma` at that moment, including another session's half-finished edits. Check
  `git diff prisma/schema.prisma` first. A full-project `typecheck` also went red twice on
  files this session never touched — compare against recently-modified files before
  assuming it is yours.

---

## 9 · Commands

```bash
npm run dev                  # after any schema change: rm -rf .next first
npm run db                   # is PostgreSQL reachable, and which database
npm run db:push              # apply schema; then `npx prisma generate`
npm run typecheck && npm run lint

npm run check:payments       # 152 — gateway signatures, amounts, what unwinds an order
npm run check:dashboard      # 149 — period maths, bucketing, deltas, axes, geometry
npm run check:social         #  97 — host rules, colour arithmetic, mark sanitising
npm run check:inventory      #  37 — stock states, adjustment arithmetic, reason lists
npm run check:fulfilment     #  36 — delivery vs collection charges and wording
npm run check:price          #  33 — price parsing, sale and flash-sale refusals
npm run check:brand-logos    #  27 — logo treatment resolution and URL swapping
```

22 suites in all — `grep '"check:' package.json` lists them. 972 checks, all passing.

---

## 10 · Open ends and risks

| Severity | Item | Note |
|---|---|---|
| Medium | Sweeps are lazy, not scheduled | Abandoned orders release stock when someone loads `/cart`, `/checkout` or `/admin/inventory`. A shop with no traffic holds stock until the next visit. A cron or a scheduled route would close it. |
| Medium | A discount redemption is not returned when an order is cancelled | True of every cancellation path, not just the new one. A code with a redemption cap can be consumed by an order that never happened. `evaluateDiscount` fails gracefully, so nothing breaks — the count is just wrong. |
| Low | connectIPS has no cancelled status of its own | Its abandoned payments fall through to the receipt and are cleared by the 30-minute sweep rather than immediately. |
| Low | `scripts/tmp-testmode.ts` is still in the tree | A temporary helper that reprices one product for a drained Khalti sandbox wallet. Left in place — it belongs to the parallel session, which may still be using it. |
| Low | The 30-minute window is a constant | `UNPAID_ORDER_TIMEOUT_MINUTES` in `src/lib/payments/expiry.ts`. Long enough for a bank app, an OTP and a retry; move it to settings if a shop needs a different one. |

---

## 11 · How the payment work was verified

Worth recording, because the pure checks do not prove the write path:

- The real eSewa failure URL was hit against a real `PENDING` order: the order moved to
  `CANCELLED` with `PAYMENT_FAILED`, stock returned 8 → 10 and 3 → 4 across a product row
  and a variant row, and both lines came back in the basket with their configuration label.
- A backdated order was swept by an actual `/cart` render, with the same result plus the
  customer notification.
- A line the shopper had already re-added by hand stayed at quantity 1 rather than becoming
  3.
- Against a **PAID** order the same callback correctly did nothing: order untouched, stock
  still claimed, redirect to the receipt instead of the cart.

All probe data was removed afterwards and the stock levels restored to what they were.
