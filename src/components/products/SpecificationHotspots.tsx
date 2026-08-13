import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { SpecificationCallout } from "@/components/products/SpecificationCallout";
import type { CalloutPosition, SpecCallout } from "@/lib/products/spec-callouts";

/**
 * The annotation layer around the featured product.
 *
 * Two arrangements of the same data, chosen by width — not two different
 * datasets, and not one arrangement squeezed until it fits:
 *
 *  - **`md` and up** the callouts are placed at the corners of the stage and
 *    lean inward on hairline leaders. There is room beside the product for a
 *    card, so the fact sits next to the part it describes.
 *  - **below `md`** the leaders are dropped entirely and the same specs run as
 *    a plain two-column list *under* the stage. A phone has no room beside the
 *    product, and a callout that overlaps the photograph to make room for
 *    itself has stopped annotating it. This is why the list is rendered by this
 *    component rather than by the stage: it has to sit outside it.
 *
 * Presentational throughout. The callouts arrive built — see
 * `lib/products/spec-callouts` for which specs are chosen and why.
 *
 * `pointer-events-none` on the positioned layer: it spans the whole stage, and
 * without it the cards would sit between the cursor and the product, killing
 * the tilt, the spotlight and the drag that moves the carousel. Nothing in here
 * is interactive, so nothing needs the events back.
 */

/**
 * Where each callout sits on the stage. Percentages, so it scales with it.
 *
 * The two top cards share a `top` and the two bottom cards share a `bottom`,
 * which is the whole of the arrangement. They were staggered — four different
 * offsets, on the theory that a diagonal reads as more natural than a grid —
 * and at four corners of one photograph it did not read as a diagonal, it read
 * as four cards nobody had lined up.
 *
 * Inset from the edge rather than flush to it. Each card carries a soft shadow
 * and the track clips at exactly this boundary, so a card at `left-0` had its
 * shadow sliced down one side.
 */
const PLACEMENT: Record<CalloutPosition, string> = {
  // Clear of the Featured/New chips at the top and the name and price slabs at
  // the bottom — the annotation is an addition to that composition, not a
  // competitor for the same corners.
  // `left-5`/`right-5` rather than `left-2`: the track fades its outer 16px so
  // a panel crossing the boundary dissolves instead of being cut, and a card
  // starting inside that band would sit permanently half-faded. 20px clears it.
  "top-left": "top-[13%] left-5 justify-start",
  "top-right": "top-[13%] right-5 justify-end",
  // Lower than the top pair sit high, and deliberately so: a laptop is widest
  // at its base, so the lower corners are where a card runs into the product.
  // Dropping them clears the widest row while still leaving a gap above the
  // name and price slabs, which occupy the bottom ~14% of the stage.
  "bottom-left": "bottom-[17%] left-5 justify-start",
  "bottom-right": "bottom-[17%] right-5 justify-end",
};

export function SpecificationHotspots({
  callouts,
  /** Whether this panel is the one on stage. See the note on the fade below. */
  current,
}: {
  callouts: SpecCallout[];
  current: boolean;
}) {
  // A product with no specs recorded gets no annotation layer at all, rather
  // than an empty frame where one would be.
  if (callouts.length === 0) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-20 hidden md:block",
        /*
         * Off-stage panels are transparent, and this is not decoration.
         *
         * The track clips at the panel boundary, so while the carousel is
         * moving the neighbouring panel's cards cross that edge and are sliced
         * clean down one side — a hard vertical line travelling across the
         * hero, which is exactly what it looked like. A photograph sliced the
         * same way reads as a carousel; a *card* sliced that way reads as a
         * rendering fault.
         *
         * The name and price slabs already fade on this signal, so this is the
         * treatment the panel's other floating pieces were missing rather than
         * a new idea — and it means only the panel that has arrived is ever
         * drawn whole.
         */
        "transition-all duration-500 ease-emphasized",
        current ? "translate-y-0 opacity-100 delay-150" : "translate-y-2 opacity-0",
      )}
    >
      {callouts.map((callout) => (
        <div
          key={callout.key}
          className={cn("absolute flex", PLACEMENT[callout.position])}
        >
          <SpecificationCallout callout={callout} />
        </div>
      ))}
    </div>
  );
}

/**
 * The same specifications, for widths with no room to place them.
 *
 * Rendered under the stage rather than on it. No leaders and no dots: with the
 * cards no longer beside the product there is nothing for a line to point at,
 * and a leader drawn anyway would be decoration pretending to be a diagram.
 *
 * Not `aria-hidden`, unlike the layer above. On a phone this *is* the
 * specification list rather than a decorative echo of the product, so it is the
 * one that should be read out — and the positioned version stays hidden from
 * assistive tech so the same four facts are never announced twice.
 */
export function SpecificationList({ callouts }: { callouts: SpecCallout[] }) {
  if (callouts.length === 0) return null;

  return (
    /* `px-5` for the same reason the positioned callouts use `left-5`: the
       track fades its outer 16px so a dragged panel dissolves at the boundary
       instead of being cut, and these cards sit at the panel's full width — so
       flush against it their outer corners were being faded away. */
    <ul className="mt-5 grid grid-cols-2 gap-2 px-5 md:hidden">
      {callouts.map((callout) => (
        <li
          key={callout.key}
          className="bg-surface hero-float min-w-0 rounded-xl px-3 py-2"
        >
          <p className="text-on-surface-variant flex items-center gap-1.5">
            <Icon name={callout.icon} size={14} className="text-primary shrink-0" />
            <span className="truncate text-[10px] font-semibold tracking-[0.14em] uppercase">
              {callout.label}
            </span>
          </p>
          <p className="text-on-surface mt-0.5 truncate text-sm font-semibold">
            {callout.value}
          </p>
        </li>
      ))}
    </ul>
  );
}
