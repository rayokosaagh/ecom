import { SHOP_CURRENCY, currencySymbol } from "@/lib/money/currency";

/**
 * The time window the overview is reporting on, and the arithmetic that turns
 * rows into a series.
 *
 * Deliberately free of Prisma and of `new Date()` at module scope: every
 * function takes the clock as an argument, which is what lets the whole of it
 * be checked against fixed dates (see scripts/check-dashboard.ts) rather than
 * against whatever today happens to be.
 */

/** Selectable windows. 7 / 30 / 90 rather than a free date picker: the point of
 * the overview is a glance, and a glance does not need a calendar. */
export const RANGE_DAYS = [7, 30, 90] as const;

export type RangeDays = (typeof RANGE_DAYS)[number];

export const DEFAULT_RANGE: RangeDays = 30;

/** Query-param name, shared by the page and the filter control. */
export const RANGE_PARAM = "days";

export type Period = {
  /** Midnight local time on the first day counted. */
  start: Date;
  /** Exclusive: midnight local at the end of the last day counted. */
  end: Date;
  days: number;
};

/**
 * Anything unrecognised falls back to the default rather than erroring — the
 * value comes from a URL a user can type, and a dashboard that 500s because
 * someone edited `?days=` is worse than one that shows 30 days.
 */
export function parseRange(raw: string | string[] | undefined): RangeDays {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (RANGE_DAYS as readonly number[]).includes(value)
    ? (value as RangeDays)
    : DEFAULT_RANGE;
}

/** Midnight local time on the day `date` falls in. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  // Via the date parts rather than by adding milliseconds, so a window that
  // spans a daylight-saving change still lands on midnight.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * The window ending today, inclusive.
 *
 * `days` counts days, not 24-hour blocks: a 7-day window is the last six whole
 * days plus today, which is what "last 7 days" means to the person reading it.
 */
export function currentPeriod(days: number, now: Date): Period {
  const today = startOfDay(now);
  return { start: addDays(today, -(days - 1)), end: addDays(today, 1), days };
}

/** The window of the same length immediately before, for comparisons. */
export function previousPeriod(period: Period): Period {
  return {
    start: addDays(period.start, -period.days),
    end: period.start,
    days: period.days,
  };
}

/** Sortable local-day key, `YYYY-MM-DD`. Local, not UTC — see `bucketByDay`. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Every day in the period, in order. */
export function eachDay(period: Period): Date[] {
  return Array.from({ length: period.days }, (_, i) => addDays(period.start, i));
}

/**
 * Sum rows into one bucket per day of the period.
 *
 * Bucketing happens here rather than in SQL on purpose. `date_trunc` groups by
 * the *database's* timezone, so an order placed at 8pm can land on the next day
 * in the chart while the order list — rendered from the same timestamp in the
 * server's timezone — shows it on this one. Two views of one order disagreeing
 * about which day it happened is a bug report waiting to happen, so the day a
 * row belongs to is decided in exactly one place, and this is it.
 *
 * The cost is fetching the rows in the window instead of an aggregate. That is
 * a bounded read — at most 90 days of orders, two columns each.
 */
export function bucketByDay<T>(
  rows: readonly T[],
  period: Period,
  getDate: (row: T) => Date,
  getValue: (row: T) => number = () => 1,
): number[] {
  const index = new Map<string, number>();
  eachDay(period).forEach((day, i) => index.set(dayKey(day), i));

  const buckets = new Array<number>(period.days).fill(0);
  for (const row of rows) {
    const slot = index.get(dayKey(getDate(row)));
    // A row outside the window is skipped rather than clamped into the first
    // or last bucket, which would invent a spike at the edge.
    if (slot !== undefined) buckets[slot] += getValue(row);
  }
  return buckets;
}

export type Delta = {
  /** Signed fraction, e.g. 0.42 for +42%. */
  ratio: number;
  direction: "up" | "down" | "flat";
};

/**
 * Change against the previous window.
 *
 * Null when there is nothing to compare against. Growth from zero has no
 * percentage — "+100%" would be a lie and "+∞%" is not a number anyone wants
 * on a dashboard — so the caller is made to say something else instead.
 */
export function delta(current: number, previous: number): Delta | null {
  if (previous === 0) return null;
  const ratio = (current - previous) / previous;
  // A hair either side of zero is flat. Without this a rounding-level wobble
  // renders as a confident green arrow.
  if (Math.abs(ratio) < 0.0005) return { ratio: 0, direction: "flat" };
  return { ratio, direction: ratio > 0 ? "up" : "down" };
}

export function formatDelta(value: Delta): string {
  const sign = value.direction === "up" ? "+" : value.direction === "down" ? "−" : "";
  return `${sign}${Math.abs(value.ratio * 100).toFixed(Math.abs(value.ratio) < 0.1 ? 1 : 0)}%`;
}

/** 1,284 · 12.9K · 3.4M — so a tile's value never wraps its card. */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 10_000) return value.toLocaleString("en-US");
  if (Math.abs(value) < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/**
 * The same, for money held in minor units: Rs 4,231 · Rs 12.9K · Rs 3.4M.
 *
 * Built from the symbol and a compacted number rather than through `Intl`,
 * because `Intl` will always group the digits in full and the whole point of a
 * stat tile is a figure that fits its card.
 */
export function formatCompactMoney(minor: number): string {
  const major = minor / SHOP_CURRENCY.minorUnits;
  // Sign is peeled off first so it lands outside the symbol — -Rs 40, never
  // Rs -40.
  const sign = major < 0 ? "-" : "";
  const magnitude = Math.abs(major);
  const symbol = currencySymbol();
  // A letter-symbol like "Rs" needs the space a "$" does not.
  const gap = /[A-Za-z]$/.test(symbol) ? " " : "";
  return magnitude < 10_000
    ? `${sign}${symbol}${gap}${Math.round(magnitude).toLocaleString(SHOP_CURRENCY.locale)}`
    : `${sign}${symbol}${gap}${formatCompact(magnitude)}`;
}

/** "7 Aug" — axis and tooltip labels. */
export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** "Aug 7, 2026" — the accessible table's row header, unambiguous out of context. */
export function formatDayFull(date: Date): string {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
