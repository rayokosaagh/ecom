import { cn } from "@/lib/cn";

/**
 * A read-only star rating.
 *
 * Drawn as one filled row clipped over one empty row, so 4.3 stars is actually
 * 4.3 stars wide rather than rounded to the nearest half. Rounding a 4.4 up to
 * 4.5 is a small lie told on every card.
 *
 * The stars are `aria-hidden` and the score is stated in text alongside, since
 * "★★★★☆" read aloud is noise.
 */
export function RatingStars({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const stars = "★★★★★";

  return (
    <span
      aria-hidden
      className={cn("relative inline-block leading-none select-none", className)}
      style={{ fontSize: size, letterSpacing: "0.1em" }}
    >
      <span className="text-on-surface-variant/30">{stars}</span>
      <span
        className="text-primary absolute inset-0 overflow-hidden"
        // Percentage of the row, not of five whole glyphs — the letter spacing
        // rides along with the width, so the clip lands where it looks right.
        style={{ width: `${(clamped / 5) * 100}%` }}
      >
        {stars}
      </span>
    </span>
  );
}

/**
 * The compact form for product cards: stars, the score, and how many people
 * said so.
 *
 * Renders nothing at all when there are no reviews. An empty row of grey stars
 * reads as "rated badly" rather than "not yet rated", which is the opposite of
 * the truth for something new.
 */
export function RatingBadge({
  average,
  count,
  size = 14,
  className,
}: {
  average: number;
  count: number;
  size?: number;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <RatingStars value={average} size={size} />
      <span className="text-on-surface-variant text-xs tabular-nums">
        {average.toFixed(1)}
        <span className="sr-only"> out of 5, </span>
        <span aria-hidden> · </span>
        {count}
        <span className="sr-only"> review{count === 1 ? "" : "s"}</span>
      </span>
    </span>
  );
}
