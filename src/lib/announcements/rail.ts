/**
 * How wide the rail is, how many times it repeats, and how long a lap takes.
 *
 * Pure arithmetic with no DOM and no measuring — `npm run check:announcements`
 * exercises it directly. Nothing here is measured in the browser on purpose:
 * a marquee that reads its own width has to wait for layout, run on every
 * resize, and disagree with the server on the first paint. Estimating from the
 * text is less exact and entirely stable, and the only thing the estimate has
 * to be right about is being *too big* rather than too small.
 */

/**
 * Average advance width of one character, in px, at the strip's size.
 *
 * Deliberately generous. Over-estimating makes the track longer than it needs
 * to be, which costs a little DOM; under-estimating breaks the loop, which is
 * the bug this whole module exists to prevent.
 */
const CHAR_PX = 8;

/** Icon, gaps, `px-5` either side, and the blend that follows each message. */
const ITEM_CHROME_PX = 112;

/** The trailing arrow a linked notice carries. */
const LINK_CHROME_PX = 20;

/**
 * How wide one copy of the sequence must be before it can loop.
 *
 * **This is the fix for the strip that stopped a quarter of the way across.**
 * The loop works by translating the track by exactly one copy's width, so the
 * second copy lands where the first began. That only looks continuous if a
 * single copy is at least as wide as the viewport — otherwise the translation
 * is shorter than the screen, the content slides a little way in and parks
 * there with the rest of the strip empty, which is precisely what one short
 * notice did.
 *
 * So the sequence is repeated until it clears this width. Wider than any
 * ordinary monitor, because the cost of overshooting is a few more spans and
 * the cost of undershooting is the bug coming back on a bigger screen.
 */
const MIN_COPY_PX = 2600;

/**
 * Travel speed, in px per second.
 *
 * A speed rather than a duration, and that is the substantive part: with a
 * fixed duration, one notice crawls and six sprint, because they all have to
 * cover their own length in the same time. Fixing px/second instead means the
 * strip reads at the same pace whatever it happens to be carrying — and the
 * repetition above, which can multiply the track's length several times over,
 * no longer slows it to a halt.
 */
const SPEED_PX_PER_SEC = 90;

export interface RailItem {
  message: string;
  href?: string | null;
}

/** Roughly how much room one notice takes, including what follows it. */
export function estimateItemWidth(item: RailItem): number {
  return item.message.length * CHAR_PX + ITEM_CHROME_PX + (item.href ? LINK_CHROME_PX : 0);
}

/** How many times the sequence repeats inside one copy of the track. */
export function railRepeats(items: RailItem[]): number {
  if (items.length === 0) return 1;

  const sequence = items.reduce((total, item) => total + estimateItemWidth(item), 0);
  if (sequence <= 0) return 1;

  return Math.max(1, Math.ceil(MIN_COPY_PX / sequence));
}

/**
 * Seconds for one lap, so the strip travels at a constant speed.
 *
 * Floored rather than left free: a very short track would otherwise be handed a
 * duration small enough to read as a flicker rather than as movement.
 */
export function railDurationSeconds(items: RailItem[], repeats: number): number {
  const copy = items.reduce((total, item) => total + estimateItemWidth(item), 0) * repeats;
  return Math.max(8, Math.round(copy / SPEED_PX_PER_SEC));
}
