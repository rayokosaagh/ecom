import { OrderStatus } from "@/generated/prisma/enums";

/**
 * The shape of the admin order list, read off the URL.
 *
 * Deliberately *not* `server-only`: the page parses these on the server, but the
 * sort dropdown and the per-page selector are client components that need the
 * same option lists and the same labels. One definition, so a value the control
 * can produce is always a value the parser accepts.
 */

export const STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

export function parseStatus(value: string | undefined): OrderStatus | undefined {
  return STATUSES.includes(value as OrderStatus) ? (value as OrderStatus) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Sort                                                                       */
/* -------------------------------------------------------------------------- */

export type OrderSort = "newest" | "oldest" | "highest" | "lowest";

export const SORT_OPTIONS: { value: OrderSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest amount" },
  { value: "lowest", label: "Lowest amount" },
];

const SORTS = new Set<string>(SORT_OPTIONS.map((option) => option.value));

/**
 * The default depends on which tab you are standing on.
 *
 * Everywhere else newest-first is what an admin wants — the list is a feed of
 * what just happened. On Pending it is exactly backwards: the order that has
 * been waiting longest is the one about to become a complaint, and newest-first
 * buries it at the bottom of the last page.
 */
export function defaultSort(status: OrderStatus | undefined): OrderSort {
  return status === OrderStatus.PENDING ? "oldest" : "newest";
}

export function parseSort(value: string | undefined, status: OrderStatus | undefined): OrderSort {
  return value && SORTS.has(value) ? (value as OrderSort) : defaultSort(status);
}

/* -------------------------------------------------------------------------- */
/* Paging                                                                     */
/* -------------------------------------------------------------------------- */

export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 50;

export function parsePerPage(value: string | undefined): number {
  const n = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE;
}

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/* -------------------------------------------------------------------------- */
/* View                                                                       */
/* -------------------------------------------------------------------------- */

export type OrderView = "table" | "cards";

export function parseView(value: string | undefined): OrderView {
  return value === "cards" ? "cards" : "table";
}

/* -------------------------------------------------------------------------- */
/* Date range                                                                 */
/* -------------------------------------------------------------------------- */

export type DateRangeKey = "today" | "7d" | "month" | "custom";

export const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const RANGE_KEYS = new Set<string>(DATE_RANGE_OPTIONS.map((option) => option.value));

export function parseRangeKey(value: string | undefined): DateRangeKey | undefined {
  return value && RANGE_KEYS.has(value) ? (value as DateRangeKey) : undefined;
}

export interface DateWindow {
  from?: Date;
  to?: Date;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * `YYYY-MM-DD` from a `<input type="date">`, read as a *local* day.
 *
 * `new Date("2026-08-11")` parses as midnight UTC, which in any timezone west of
 * Greenwich is the previous evening — so a shop in Kathmandu asking for orders
 * "from the 11th" would be handed a slice of the 10th. Splitting the parts and
 * feeding them to the local constructor keeps the day the one the admin typed.
 */
function parseLocalDay(value: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return undefined;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The last instant of the given local day, so `to` is inclusive. */
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/**
 * Turn the range pill (plus the two custom dates) into an actual window.
 *
 * `now` is a parameter rather than a `new Date()` inside so the window a page
 * renders and the window its CSV export re-derives are the same one, and so the
 * boundaries are testable without freezing the clock.
 */
export function resolveDateWindow(
  key: DateRangeKey | undefined,
  from: string | undefined,
  to: string | undefined,
  now: Date,
): DateWindow {
  switch (key) {
    case "today":
      return { from: startOfDay(now) };

    case "7d": {
      // Seven days *including* today, which is what "last 7 days" means to the
      // person reading it — not today plus a full week behind it.
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6);
      return { from: start };
    }

    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1) };

    case "custom": {
      const start = parseLocalDay(from);
      const end = parseLocalDay(to);
      // A backwards range matches nothing and looks like a bug rather than a
      // typo, so swap it into the range they plainly meant.
      if (start && end && start > end) {
        return { from: startOfDay(end), to: endOfDay(start) };
      }
      return { from: start, to: end ? endOfDay(end) : undefined };
    }

    default:
      return {};
  }
}

/** How the range reads in the "Showing X–Y of Z" line and on the export. */
export function describeDateWindow(
  key: DateRangeKey | undefined,
  window: DateWindow,
): string | null {
  if (!key) return null;
  if (key !== "custom") {
    return DATE_RANGE_OPTIONS.find((option) => option.value === key)?.label ?? null;
  }

  const day = (date: Date) =>
    date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  if (window.from && window.to) return `${day(window.from)} – ${day(window.to)}`;
  if (window.from) return `From ${day(window.from)}`;
  if (window.to) return `Until ${day(window.to)}`;
  return null;
}
