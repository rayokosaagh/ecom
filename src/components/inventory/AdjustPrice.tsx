"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { adjustPrice, type StockActionState } from "@/lib/actions/inventory";
import {
  MAX_NOTE_LENGTH,
  describeSaleChange,
  parseCompareAtInput,
  parsePercentInput,
  parsePriceInput,
  parseSaleEndInput,
  percentOffLabel,
  planPriceChange,
  priceDeltaSign,
  priceFromPercentOff,
} from "@/lib/inventory/price";
import { centsToInput, formatPrice } from "@/lib/products/format";
import { cn } from "@/lib/cn";

const FIELD =
  "border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 rounded-md border bg-transparent px-3 text-sm outline-none transition-colors duration-200";

/** A Date as the value a `datetime-local` input shows: local wall-clock, no zone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The price control on the inventory page.
 *
 * Deliberately the same component as `AdjustStock` in every way that is not
 * about money: collapsed to a button until used, local state rather than a
 * route so the filters and scroll position survive it, and a preview line
 * driven by the *same* `planPriceChange` the server action runs — so what the
 * panel shows is the calculation that will happen rather than a guess at it.
 *
 * Two figures, in plain words. **Price** is what customers pay. **On sale**
 * is a switch; when it is on, a **regular price** — the higher figure shown
 * crossed out beside the price — is required. That is the whole model of a
 * sale in this shop (see lib/products/sale), and the panel says it in those
 * terms rather than asking for a "compare-at" or a "was". Turning the switch
 * on prefills the regular price with the current price, because "mark it down
 * from what it costs today" is what nine sales in ten are; turning it off ends
 * the sale and leaves the price exactly where it is, and the panel says so.
 *
 * This is the only place a price or a sale is set once a product exists, so
 * it can do each on its own: a blank price with the switch flipped changes
 * only the sale; a new price with the switch untouched changes only the price.
 *
 * Two scopes, one component. On the **Sales** page (`scope="sale"`) the whole
 * panel is offered. On **Inventory** (`scope="price"`) only the price and the
 * note are: that screen is about what is running out, and three-quarters of
 * a panel about sales on it was answering a question nobody on that page was
 * asking. A line that is on sale still says so there, read-only, with a way
 * to the Sales page — and the price rules still know about the regular
 * price, so a reprice cannot climb above it unseen.
 *
 * A sale can also be set as a percentage. "20% off" is how most markdowns are
 * decided, so the sale box takes one and works the price out from the regular
 * price (whole rupees, see `priceFromPercentOff`); typing a price instead
 * shows the percentage it amounts to. Only the price is ever saved — the
 * percentage is a way of arriving at it, not a second thing stored.
 *
 * Where it refuses, it refuses here first and says why:
 *
 *  - A live flash sale is written straight into the price column and puts it
 *    back on close. The panel does not open at all in that case — offering a
 *    field that cannot be saved is worse than saying why up front.
 *  - A regular price has to be above the price, or there is no discount to
 *    show. Caught as it is typed, from either side.
 *
 * A note but no reason dropdown, matching `PriceChange` — see the model's own
 * comment on why the two ledgers are asymmetric.
 */
export function AdjustPrice({
  productId,
  variantId,
  name,
  configuration,
  priceCents,
  compareAtPriceCents,
  saleEndsAt = null,
  flashSaleName,
  buttonLabel = "Reprice",
  buttonIcon = "sell",
  openOnSale = false,
  scope = "sale",
}: {
  productId: string;
  variantId: string | null;
  name: string;
  configuration: string | null;
  priceCents: number;
  /** The regular price, when this row is on sale. Null otherwise. */
  compareAtPriceCents: number | null;
  /** When the sale ends by itself, if a date was set. */
  saleEndsAt?: Date | string | null;
  /** The flash sale holding this product's price, if one is live. */
  flashSaleName: string | null;
  /** What the collapsed button says — "Reprice" on Inventory, "Put on sale" on Sales. */
  buttonLabel?: string;
  buttonIcon?: string;
  /**
   * Open with the sale switch already on and the regular price prefilled.
   * The Sales page's "put on sale" button: the admin has said what they are
   * here to do, so the panel starts there instead of one click short of it.
   */
  openOnSale?: boolean;
  /**
   * "sale" offers the whole panel; "price" offers the price and note only and
   * shows the sale, if any, read-only with a link to the Sales page. See the
   * note above.
   */
  scope?: "price" | "sale";
}) {
  const unitKey = variantId ? `${productId}:${variantId}` : productId;
  const label = configuration ? `${name} · ${configuration}` : name;
  const currentlyOnSale = compareAtPriceCents !== null;

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  // Both null until touched, meaning "as the row stands" — so the switch and
  // the field show the current state when the panel opens, and fall back to it
  // again after a save re-renders the row with new props, which a plain
  // initial state would not notice.
  const [onSaleOverride, setOnSaleOverride] = useState<boolean | null>(null);
  const [regularOverride, setRegularOverride] = useState<string | null>(null);
  // What was typed in the discount box, or null when the box should show the
  // percentage the price and regular price currently amount to.
  const [percentOverride, setPercentOverride] = useState<string | null>(null);
  // The sale's end as typed, or null to show what is stored. A
  // `datetime-local` value is local wall-clock time without a zone, which is
  // what a person means by "ends Friday at six".
  const [endsOverride, setEndsOverride] = useState<string | null>(null);
  const standingEnds = saleEndsAt ? toLocalInput(new Date(saleEndsAt)) : "";
  const ends = endsOverride ?? standingEnds;
  const parsedEnd = parseSaleEndInput(ends);

  // In price scope the sale is whatever it is: the switch and the fields are
  // not shown, so the overrides never move off "as the row stands".
  const saleEditable = scope === "sale";
  const onSale = saleEditable ? (onSaleOverride ?? currentlyOnSale) : currentlyOnSale;
  const regular = saleEditable
    ? (regularOverride ?? (compareAtPriceCents === null ? "" : centsToInput(compareAtPriceCents)))
    : compareAtPriceCents === null
      ? ""
      : centsToInput(compareAtPriceCents);

  const fieldId = useId();
  const priceRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPrice("");
    setOnSaleOverride(null);
    setRegularOverride(null);
    setPercentOverride(null);
    setEndsOverride(null);
  };

  // Collapse once the change lands, from inside the action rather than an
  // effect watching its result — see the note on AdjustStock, which this
  // mirrors exactly.
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    async (previous, formData) => {
      const result = await adjustPrice(previous, formData);
      if (result.success) {
        setOpen(false);
        reset();
      }
      return result;
    },
    {},
  );

  // Only this row's outcome. Every row mounts its own form, and a stale state
  // object would otherwise show someone else's message.
  const mine = state.key === unitKey ? state : null;

  useEffect(() => {
    if (open) priceRef.current?.focus();
  }, [open]);

  // ---- What the form currently describes, judged by the shared rules -------

  const typedPrice = price.trim();
  const parsedPrice = typedPrice === "" ? null : parsePriceInput(typedPrice);
  const nextCents = parsedPrice?.ok ? parsedPrice.cents : priceCents;

  // Off means no regular price, whatever the field held. On with a blank field
  // is an incomplete answer rather than "no sale".
  const parsedRegular = onSale
    ? regular.trim() === ""
      ? { ok: false as const, error: "Enter the regular price, or turn the sale off" }
      : parseCompareAtInput(regular)
    : { ok: true as const, cents: null };

  const endsChanged = onSale && ends !== standingEnds;
  const untouched =
    parsedPrice === null &&
    parsedRegular.ok &&
    parsedRegular.cents === compareAtPriceCents &&
    !endsChanged;

  const plan = untouched
    ? null
    : parsedPrice && !parsedPrice.ok
      ? { ok: false as const, error: parsedPrice.error }
      : !parsedRegular.ok
        ? { ok: false as const, error: parsedRegular.error }
        : onSale && !parsedEnd.ok
          ? { ok: false as const, error: parsedEnd.error }
          : endsChanged && parsedPrice === null && parsedRegular.cents === compareAtPriceCents
            ? // Only the end date moved: a valid change the price rules have no
              // opinion on, so it is planned as "nothing else changes".
              {
                ok: true as const,
                data: { toCents: priceCents, deltaCents: 0, toCompareAtCents: compareAtPriceCents },
              }
            : planPriceChange(
            {
              currentCents: priceCents,
              compareAtCents: compareAtPriceCents,
              inLiveFlashSale: flashSaleName !== null,
              flashSaleName,
            },
            nextCents,
            parsedRegular.cents,
          );

  const toggleSale = (next: boolean) => {
    setOnSaleOverride(next);
    // Switching on for a row that is not on sale: the obvious regular price
    // is what it costs today — the admin is marking it down from there. Left
    // editable, because it is a guess at intent, not a rule.
    if (next && !currentlyOnSale && regular.trim() === "") {
      setRegularOverride(centsToInput(priceCents));
    }
  };

  // ---- The discount, as a percentage ----------------------------------------
  // Derived from the two prices unless the admin is typing it; typing it
  // rewrites the price. The regular price is the anchor either way.

  const regularCents = parsedRegular.ok ? parsedRegular.cents : null;
  const derivedPercent =
    regularCents !== null && regularCents > nextCents
      ? String(Math.round(((regularCents - nextCents) / regularCents) * 1000) / 10)
      : "";
  const percent = percentOverride ?? derivedPercent;
  const parsedPercent = percentOverride === null ? null : parsePercentInput(percentOverride);

  const applyPercent = (raw: string, anchorCents: number | null) => {
    setPercentOverride(raw);
    if (raw.trim() === "") return;
    const parsedPct = parsePercentInput(raw);
    if (parsedPct.ok && anchorCents !== null) {
      setPrice(centsToInput(priceFromPercentOff(anchorCents, parsedPct.percent)));
    }
  };

  const openPanel = () => {
    setOpen(true);
    if (saleEditable && openOnSale && !currentlyOnSale) toggleSale(true);
  };

  // ---- Collapsed ------------------------------------------------------------

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={openPanel}
          // Not disabled: a disabled control with no explanation is a dead end,
          // and the panel's whole job in this case is to carry the explanation.
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name={buttonIcon} size={16} />
          {buttonLabel}
          <span className="sr-only"> — {label}</span>
        </button>

        {mine?.success && (
          <p role="status" className="text-tertiary max-w-[16rem] text-right text-xs">
            {mine.success}
          </p>
        )}
      </div>
    );
  }

  // ---- A flash sale owns the column -----------------------------------------
  // There is nothing useful to offer, so the panel is the explanation and a
  // way out rather than a form.

  if (flashSaleName) {
    return (
      <div className="bg-surface-container-low border-outline-variant w-full min-w-0 space-y-3 rounded-lg border p-3 sm:w-[24rem]">
        <p className="text-on-surface flex items-start gap-2 text-xs">
          <Icon name="bolt" size={16} className="text-tertiary mt-px shrink-0" />
          <span>
            <strong className="font-medium">{flashSaleName}</strong> is holding
            this price until it ends. Changing it here would stop the price going
            back when the sale closes — edit the sale instead.
          </span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
          >
            Close
          </button>
          <a
            href="/admin/flash-sales"
            className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Flash sales
            <Icon name="arrow_forward" size={16} />
          </a>
        </div>
      </div>
    );
  }

  // ---- The form -------------------------------------------------------------

  const currentDiscount = percentOffLabel(priceCents, compareAtPriceCents);
  const nextDiscount = plan?.ok ? percentOffLabel(plan.data.toCents, plan.data.toCompareAtCents) : null;
  const saleChange = plan?.ok
    ? describeSaleChange(compareAtPriceCents, plan.data.toCompareAtCents, formatPrice)
    : null;

  return (
    <form
      action={formAction}
      className="bg-surface-container-low border-outline-variant w-full min-w-0 space-y-3 rounded-lg border p-3 sm:w-[24rem]"
    >
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}
      {/* The regular price the server should write: blank when the switch is
          off, so "not on sale" is posted rather than a stale figure. The end
          date likewise — it only means something while the sale is on. Not
          posted at all in price scope: absent means "leave the sale as it
          is", which is exactly what that panel promises. */}
      {saleEditable && (
        <>
          <input type="hidden" name="compareAt" value={onSale ? regular : ""} />
          <input
            type="hidden"
            name="saleEndsAt"
            value={
              onSale && parsedEnd.ok && parsedEnd.endsAt ? parsedEnd.endsAt.toISOString() : ""
            }
          />
        </>
      )}

      {/* What the row is now, so every change below is read against it. */}
      <p className="text-on-surface-variant text-xs">
        Currently <span className="text-on-surface tabular-nums">{formatPrice(priceCents)}</span>
        {currentlyOnSale ? (
          <>
            {" "}
            · on sale, regular price{" "}
            <span className="tabular-nums line-through">
              {formatPrice(compareAtPriceCents!)}
            </span>
            {currentDiscount && <> ({currentDiscount})</>}
          </>
        ) : (
          <> · not on sale</>
        )}
      </p>

      {/* Price ------------------------------------------------------------ */}
      <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1">
        <label htmlFor={`${fieldId}-price`} className="text-on-surface text-sm">
          Price
        </label>
        <input
          ref={priceRef}
          id={`${fieldId}-price`}
          name="price"
          type="text"
          // Not `type="number"`: a price is typed with grouping separators
          // pasted in from the table above, and a number input silently
          // discards the whole value rather than letting the parser strip them.
          inputMode="decimal"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            // A price typed by hand takes over from a percentage typed
            // earlier; the box goes back to showing what the figures amount to.
            setPercentOverride(null);
          }}
          // Not required: left blank, the price stays and only the sale
          // changes — which is how a sale is started or ended on its own.
          placeholder={`${centsToInput(priceCents)} (unchanged)`}
          aria-describedby={`${fieldId}-price-help`}
          className={cn(FIELD, "w-full tabular-nums")}
        />
        <p id={`${fieldId}-price-help`} className="text-on-surface-variant col-start-2 text-xs">
          What customers pay. Leave blank to keep it.
        </p>
      </div>

      {/* Sale ------------------------------------------------------------- */}
      {!saleEditable ? (
        currentlyOnSale && (
          /* Read-only: the sale is managed on the Sales page. Said here so a
             reprice that runs into the regular price is not a surprise. */
          <p className="text-on-surface-variant border-outline-variant rounded-md border p-3 text-xs">
            <span className="text-on-surface">On sale</span> — regular price{" "}
            <span className="tabular-nums line-through">{formatPrice(compareAtPriceCents!)}</span>
            {currentDiscount && <> ({currentDiscount})</>}. The price has to stay below it.
            Change or end the sale on the{" "}
            <a
              href={`/admin/sales?q=${encodeURIComponent(name)}`}
              className="text-primary hover:underline"
            >
              Sales page
            </a>
            .
          </p>
        )
      ) : (
        <div className="border-outline-variant space-y-2 rounded-md border p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={onSale}
              onChange={(event) => toggleSale(event.target.checked)}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="text-on-surface block text-sm">On sale</span>
              <span className="text-on-surface-variant block text-xs">
                Shows a higher regular price crossed out next to the price, and
                lists this on the Sale page.
              </span>
            </span>
          </label>

          {onSale ? (
            <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 pl-6">
              <label htmlFor={`${fieldId}-regular`} className="text-on-surface text-sm">
                Regular price
              </label>
              <input
                id={`${fieldId}-regular`}
                name="regularPriceDisplay"
                type="text"
                inputMode="decimal"
                value={regular}
                onChange={(event) => {
                  setRegularOverride(event.target.value);
                  // A percentage typed earlier still stands — re-anchor the
                  // price to the new regular price.
                  if (percentOverride !== null) {
                    const next = parseCompareAtInput(event.target.value);
                    applyPercent(percentOverride, next.ok ? next.cents : null);
                  }
                }}
                placeholder="Higher than the price"
                aria-describedby={`${fieldId}-regular-help`}
                className={cn(FIELD, "w-full tabular-nums")}
              />
              <p id={`${fieldId}-regular-help`} className="text-on-surface-variant col-start-2 text-xs">
                The figure customers see struck through. Must be higher than the price.
              </p>

              <label htmlFor={`${fieldId}-percent`} className="text-on-surface text-sm">
                Discount
              </label>
              <div className="flex items-center gap-2">
                <div className="relative w-28">
                  <input
                    id={`${fieldId}-percent`}
                    type="text"
                    inputMode="decimal"
                    value={percent}
                    onChange={(event) => applyPercent(event.target.value, regularCents)}
                    placeholder="e.g. 20"
                    aria-describedby={`${fieldId}-percent-help`}
                    className={cn(FIELD, "w-full pr-8 tabular-nums")}
                  />
                  <span
                    aria-hidden
                    className="text-on-surface-variant pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm"
                  >
                    %
                  </span>
                </div>
                {parsedPercent && !parsedPercent.ok && percent.trim() !== "" ? (
                  <span className="text-error text-xs">{parsedPercent.error}</span>
                ) : parsedPercent?.ok && regularCents !== null ? (
                  <span className="text-on-surface-variant text-xs whitespace-nowrap tabular-nums">
                    = {formatPrice(priceFromPercentOff(regularCents, parsedPercent.percent))}
                  </span>
                ) : null}
              </div>
              <p id={`${fieldId}-percent-help`} className="text-on-surface-variant col-start-2 text-xs">
                Type a percentage to work the price out from the regular price, or leave it and set
                the price above.
              </p>

              <label htmlFor={`${fieldId}-ends`} className="text-on-surface text-sm">
                Ends on
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${fieldId}-ends`}
                  type="datetime-local"
                  value={ends}
                  onChange={(event) => setEndsOverride(event.target.value)}
                  aria-describedby={`${fieldId}-ends-help`}
                  className={cn(FIELD, "w-full")}
                />
                {ends && (
                  <button
                    type="button"
                    onClick={() => setEndsOverride("")}
                    className="text-on-surface-variant rounded-sm text-xs hover:underline focus-visible:outline-2"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p id={`${fieldId}-ends-help`} className="text-on-surface-variant col-start-2 text-xs">
                Optional. At this time the sale ends by itself and the price goes back to the
                regular price. Leave empty to run until you end it.
              </p>
            </div>
          ) : (
            currentlyOnSale && (
              <p className="text-on-surface-variant pl-6 text-xs">
                Ends the sale. The price stays at{" "}
                <span className="tabular-nums">{formatPrice(nextCents)}</span> — raise
                it above if it should go back up.
              </p>
            )
          )}
        </div>
      )}

      {/* The change, before it is committed ------------------------------- */}
      <p
        role={plan && !plan.ok ? "alert" : undefined}
        className={cn("text-xs", plan && !plan.ok ? "text-error" : "text-on-surface-variant")}
      >
        {!plan ? (
          saleEditable ? (
            <>Type a new price, or change the sale, to see what will be saved.</>
          ) : (
            <>Type a new price to see what will be saved.</>
          )
        ) : plan.ok ? (
          <span className="text-on-surface tabular-nums">
            {plan.data.deltaCents === 0 ? (
              <>Price stays {formatPrice(priceCents)}</>
            ) : (
              <>
                {formatPrice(priceCents)} →{" "}
                <strong className="font-medium">{formatPrice(plan.data.toCents)}</strong>{" "}
                <span className="text-on-surface-variant">
                  ({priceDeltaSign(plan.data.deltaCents)}
                  {formatPrice(Math.abs(plan.data.deltaCents))})
                </span>
              </>
            )}
            {saleChange && <span className="text-tertiary"> · {saleChange}</span>}
            {nextDiscount && <span className="text-on-surface-variant"> · {nextDiscount}</span>}
          </span>
        ) : (
          plan.error
        )}
      </p>

      {/* Note ------------------------------------------------------------- */}
      <label htmlFor={`${fieldId}-note`} className="sr-only">
        Note (optional)
      </label>
      <input
        id={`${fieldId}-note`}
        name="note"
        type="text"
        maxLength={MAX_NOTE_LENGTH}
        placeholder="Note — supplier cost, competitor… (optional)"
        className={cn(FIELD, "w-full")}
      />

      {mine?.message && (
        <p role="alert" className="text-error text-xs">
          {mine.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          // Refused here for the reason shown above it; the action refuses it
          // again on its own account. Nothing changed is nothing to save.
          disabled={pending || plan === null || !plan.ok}
          className="bg-primary text-on-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
