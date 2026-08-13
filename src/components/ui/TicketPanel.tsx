import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * A panel shaped like a raffle ticket: a body, a perforation with a notch
 * punched into each edge, and a tear-off stub.
 *
 * Shared rather than copied because the stub's height and the mask's `--tear`
 * offset have to agree — the notches sit on the perforation only while they
 * do. Encoding that invariant twice is how one of them quietly drifts.
 */

/** Matches `--tear` in globals.css. Change both or neither. */
const STUB_HEIGHT = "h-21";

/**
 * Bar widths for the decorative barcode.
 *
 * Derived from the seed so the same order or product always draws the same
 * bars. A random pattern would reshuffle on every render, which on something
 * pretending to be a printed ticket is exactly the wrong impression.
 */
function bars(seed: string): number[] {
  const widths: number[] = [];
  for (let i = 0; i < 34; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    widths.push((code % 3) + 1);
  }
  return widths;
}

export function TicketBarcode({ seed, className }: { seed: string; className?: string }) {
  return (
    <div aria-hidden className={cn("ticket-barcode", className)}>
      {bars(seed).map((width, index) => (
        <span key={index} style={{ width: `${width}px` }} />
      ))}
    </div>
  );
}

export function TicketPanel({
  children,
  stub,
  href,
  surface = "bg-surface-container-lowest",
  className,
  ...rest
}: {
  /** The body above the perforation. Supplies its own padding. */
  children: React.ReactNode;
  /** The counterfoil. Laid out as a row, vertically centred. */
  stub: React.ReactNode;
  /** Makes the whole ticket a link. */
  href?: string;
  /**
   * The ticket's own surface. A separate prop rather than something to
   * override through `className`, because `cn` here is a plain joiner with no
   * conflict resolution — two background utilities would both be emitted and
   * whichever Tailwind happened to order last would win.
   *
   * Worth setting wherever the page behind it is already near-white: the
   * default only reads as paper against a tinted page.
   */
  surface?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const content = (
    <>
      {children}

      {/* The tear line. Inset past the notches at both ends so the dashes stop
          where the holes begin. */}
      <div aria-hidden className="ticket-perforation" />

      <div className={cn("flex items-center justify-between gap-4 px-5", STUB_HEIGHT)}>
        {stub}
      </div>
    </>
  );

  const classes = cn(
    "group ticket relative block",
    surface,
    // A shadow would be clipped along with everything else the mask touches,
    // so separation from the page comes from the surface colour alone.
    href &&
      "transition-transform duration-200 ease-emphasized hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2",
    className,
  );

  // Inline because the mask needs the radius on the element itself; a utility
  // class here would be overridden by whatever the caller passes.
  const style = { borderRadius: "0.875rem" } as const;

  if (href) {
    return (
      <Link href={href} className={classes} style={style} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} style={style} {...rest}>
      {content}
    </div>
  );
}
