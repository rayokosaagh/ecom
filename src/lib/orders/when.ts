/**
 * How a date reads in the order list.
 *
 * Two formats rather than one, because the two questions are different. For
 * something that happened today the useful fact is *how long ago* — "20 minutes
 * ago" is a queue position, and "11 Aug 2026, 14:32" makes you do the
 * subtraction yourself. Past a day the elapsed time stops meaning anything and
 * the calendar date is what you would quote to a customer, so it switches over.
 *
 * `now` is always a parameter. These run inside server components, and a
 * `Date.now()` hidden in here would be a different instant on the server than
 * on the client — which is a hydration mismatch for exactly the rows a reader
 * is most likely to be looking at.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past this, a pending order is late enough that someone should look at it. */
export const OVERDUE_PENDING_HOURS = 24;

const absolute = (date: Date) =>
  date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export interface OrderDate {
  /** What the cell shows. */
  text: string;
  /** The full timestamp, for the `title` — the relative form loses it. */
  title: string;
}

export function formatOrderDate(date: Date, now: Date): OrderDate {
  const elapsed = now.getTime() - date.getTime();
  const title = date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // A clock skew or an order placed a second into the future should read as
  // "just now", not as a negative age.
  if (elapsed < MINUTE) return { text: "Just now", title };
  if (elapsed < HOUR) return { text: plural(Math.floor(elapsed / MINUTE), "minute"), title };
  if (elapsed < DAY) return { text: plural(Math.floor(elapsed / HOUR), "hour"), title };

  return { text: absolute(date), title };
}

export interface PendingAge {
  hours: number;
  overdue: boolean;
  /** Compact enough to sit beside a status badge: "26h", "3d". */
  short: string;
  /** Spelled out, for the accessible name. */
  long: string;
}

/**
 * How long an order has been sitting unpaid.
 *
 * `createdAt` is the right clock and there is no better one to want. Nothing in
 * the transition table can move an order *into* PENDING — it is the default a
 * row is born in and the only way out is forward — so for anything still
 * pending, the moment it was created is the moment it became pending. That is
 * why this needs no `pendingAt` column.
 *
 * Not `updatedAt`, which the payment page bumps every time the customer reopens
 * it: an order abandoned for three days would read as minutes old the instant
 * someone clicked "Pay" again and wandered off.
 */
export function pendingAge(since: Date, now: Date): PendingAge {
  const hours = Math.max(0, Math.floor((now.getTime() - since.getTime()) / HOUR));
  const days = Math.floor(hours / 24);

  // Hours right up to two days, not one. The flag appears at 24h, so switching
  // to days at 24h would mean every order it ever marks reads "1d" for its
  // first full day on the list — 25 hours late and 47 hours late are not the
  // same problem, and "1d" is the one number that cannot tell them apart.
  const useDays = hours >= 48;

  return {
    hours,
    overdue: hours >= OVERDUE_PENDING_HOURS,
    short: useDays ? `${days}d` : `${hours}h`,
    long: useDays
      ? `Pending for ${days} days`
      : `Pending for ${hours} hour${hours === 1 ? "" : "s"}`,
  };
}
