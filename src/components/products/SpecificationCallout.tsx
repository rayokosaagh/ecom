import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { CalloutPosition, SpecCallout } from "@/lib/products/spec-callouts";

/**
 * One specification, annotated onto the product photograph.
 *
 * A small slab, a hairline leader and a dot where the leader meets the
 * product — the convention technical product photography has used for decades,
 * and the reason it works here is that it puts the fact *next to the thing it
 * describes* instead of in a table underneath it.
 *
 * Purely presentational: every string it draws arrives in `callout`. It holds
 * no spec values, no product knowledge and no opinion about which specs are
 * worth showing — that is `lib/products/spec-callouts`, which is a pure
 * function over what the catalogue already returned.
 *
 * The card is the same surface and shadow as the name and price slabs beside
 * it (`bg-surface`, `.hero-float`), so the annotation reads as part of the
 * hero rather than as a component borrowed from somewhere else.
 */

/** Which side the leader leaves the card from. */
function isLeft(position: CalloutPosition) {
  return position === "top-left" || position === "bottom-left";
}

/** The lower pair, which sit beside the widest part of most products. */
function isBottom(position: CalloutPosition) {
  return position === "bottom-left" || position === "bottom-right";
}

/**
 * The leader: a hairline, then the dot that lands on the product.
 *
 * Drawn as two elements rather than an SVG. The line is a 1px box and the dot
 * a small circle, so both take their colour from `currentColor` and inherit the
 * theme with no second definition — and there is no viewBox to keep in step
 * with the layout when the callout moves at a breakpoint.
 *
 * Angled a few degrees toward the product rather than run flat. A horizontal
 * rule reads as a divider; a slight rake reads as pointing, which is the whole
 * job. The rotation origin is the card end, so the dot swings and the join
 * against the card stays put.
 */
function Leader({ position }: { position: CalloutPosition }) {
  const left = isLeft(position);
  const down = position === "top-left" || position === "top-right";

  return (
    <span
      aria-hidden
      className={cn(
        // Longer than it was, so the dot lands against the product rather than
        // stopping in the space between the card and it.
        "text-primary relative hidden h-px w-12 shrink-0 md:block lg:w-20",
        // Toward the product: the upper pair rake down, the lower pair up.
        left ? "origin-left" : "origin-right",
        down ? (left ? "rotate-[14deg]" : "-rotate-[14deg]") : left ? "-rotate-[14deg]" : "rotate-[14deg]",
      )}
    >
      {/* The line itself. `currentColor` so the one `text-primary` above sets
          both halves. */}
      <span className="absolute inset-0 bg-current opacity-40" />
      {/* The dot, at the product end of the line. */}
      <span
        className={cn(
          "absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-current",
          left ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
        )}
      />
    </span>
  );
}

export function SpecificationCallout({
  callout,
  className,
}: {
  callout: SpecCallout;
  className?: string;
}) {
  const left = isLeft(callout.position);

  return (
    <div
      className={cn(
        "flex items-center",
        // The card sits on the outside and the leader points inward, so a
        // left-hand callout runs card-then-line and a right-hand one reverses.
        left ? "flex-row" : "flex-row-reverse",
        className,
      )}
    >
      {/*
        A floor, not a fixed height.

        The card used to grow with its content, so a Processor card carrying
        "CPU cores" stood a third taller than the RAM card beside it and the
        four corners no longer agreed on a horizontal. A `min-h` settles that
        for every ordinary case — two- and three-line cards all come out the
        same size, with the content centred in the frame.

        It is deliberately not `h-`. A four-line card is possible: a long value
        that wraps *and* carries a second spec under it, which is what "NVIDIA
        GeForce RTX 4070" plus "Graphics memory: 8 GB" is. Pinned to a fixed
        height that card clipped its own value — the specification ran under the
        line below it. Alignment is worth having, but not at the price of a
        spec you cannot read, so the rare long one is allowed to grow.
      */}
      <div
        className={cn(
          "bg-surface hero-float flex min-h-[4.5rem] w-[11rem] flex-col justify-center rounded-xl px-3 py-2",
          /*
            The lower pair are narrower, and only from `lg`.

            That is where the hero becomes two columns and the stage drops to
            about 684px, leaving roughly 118px between its edge and the
            product's artwork. A 13rem card cannot fit in that, so the bottom
            two were sitting over the widest part of the product — a laptop's
            base, which is exactly where it is widest. 7rem clears the artwork
            box outright rather than clearing the *visible* laptop, so it holds
            for a wide product and a narrow one alike instead of being tuned to
            whichever machine happens to be on stage.

            Below `lg` the columns stack, the stage takes the full width and
            there is room for the same card the top pair use — so the narrowing
            is scoped to the width that actually needs it rather than applied
            everywhere and left to look cramped.

            The top pair keep their width: the product is at its narrowest up
            there, and that is where the long values live — a GPU's full name
            needs the room.
          */
          isBottom(callout.position) ? "lg:w-[9.5rem]" : "lg:w-[13rem]",
        )}
      >
        <p className="text-on-surface-variant flex items-center gap-1.5">
          <Icon name={callout.icon} size={14} className="text-primary shrink-0" />
          <span className="truncate text-[10px] font-semibold tracking-[0.14em] uppercase">
            {callout.label}
          </span>
        </p>

        {/* Wraps to a second line rather than truncating. These are real values
            from the catalogue and some of them are long — "NVIDIA GeForce RTX
            4070" is the product's actual answer, and "NVIDIA GeForce RTX 4…" is
            not a specification. Two lines is the ceiling: past that the card
            stops being an annotation and starts being a paragraph. */}
        <p className="text-on-surface mt-0.5 line-clamp-2 text-sm leading-snug font-semibold">
          {callout.value}
        </p>

        {/* Only when the product actually carries the partner spec — a missing
            one produces no line rather than an empty one. */}
        {callout.secondary && (
          <p className="text-on-surface-variant mt-0.5 truncate text-[11px]">
            {callout.secondary.label}: {callout.secondary.value}
          </p>
        )}
      </div>

      <Leader position={callout.position} />
    </div>
  );
}
