/**
 * Turning the free-text opening hours into rows a table can draw.
 *
 * Deliberately free of `server-only` and of any database access, like every
 * other pure helper in this codebase — `npm run check:stores` exercises it
 * directly.
 *
 * This is **presentation, not parsing**. Nothing downstream decides anything
 * from these rows: no "open now" badge, no comparison against a clock. That is
 * on purpose. The moment the app claims a branch is open it has taken on
 * timezones, public holidays and the half-day nobody remembered to type, and it
 * will be confidently wrong on the one day it matters. Printing what the shop
 * wrote is a promise the shop can keep.
 */

export interface HoursRow {
  /** Left column — "Sun–Fri", or the whole line when there is no colon. */
  days: string;
  /** Right column, or null for a line that carried no colon. */
  time: string | null;
  /**
   * Whether this row reads as shut, so the table can grey it.
   *
   * A word test rather than a time comparison: "Closed" is what people type,
   * and there is no hour range to compare against on a day the shop is shut.
   */
  closed: boolean;
}

/** Matches a line that says the shop is shut, in the wordings people use. */
const CLOSED_PATTERN = /\b(closed|shut|holiday)\b/i;

/**
 * Split the stored text into rows.
 *
 * Splits at the *first* colon only, which is what makes "Sun–Fri: 10:00 –
 * 19:00" land as days + time rather than being torn apart at the 10:00. A line
 * with no colon keeps its whole text in `days` and renders across both columns,
 * so a note like "Public holidays vary" survives being typed into this field
 * instead of the description.
 */
export function parseHours(raw: string | null | undefined): HoursRow[] {
  if (!raw) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      // A colon at the very start ( ": 10:00" ) leaves no day to label the row
      // with, so it is treated as an unsplit line rather than an empty column.
      if (at <= 0) return { days: line, time: null, closed: CLOSED_PATTERN.test(line) };

      const days = line.slice(0, at).trim();
      const time = line.slice(at + 1).trim();

      // "Sat:" with nothing after it is a day the admin has not finished
      // typing, not a day with an empty opening time.
      if (!time) return { days, time: null, closed: CLOSED_PATTERN.test(days) };

      return { days, time, closed: CLOSED_PATTERN.test(time) };
    });
}
