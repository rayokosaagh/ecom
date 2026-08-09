/**
 * Date helpers for the banner admin.
 *
 * `datetime-local` inputs carry no timezone, and the server parses their value
 * with `new Date(...)` — which reads it as *server* local time. These
 * formatters deliberately use the same frame of reference so a saved schedule
 * round-trips to the same wall-clock time it was entered as.
 *
 * Both are used on the server and the result passed down as a plain string, so
 * a browser in another timezone cannot produce a hydration mismatch.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** Date → the "YYYY-MM-DDTHH:mm" a `datetime-local` input expects. */
export function toDateTimeLocal(date: Date | null): string {
  if (!date) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const SCHEDULE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Human-readable window, or null when the banner has no schedule at all. */
export function formatSchedule(
  startsAt: Date | null,
  endsAt: Date | null,
): string | null {
  if (!startsAt && !endsAt) return null;
  if (startsAt && !endsAt) return `From ${SCHEDULE_FORMAT.format(startsAt)}`;
  if (!startsAt && endsAt) return `Until ${SCHEDULE_FORMAT.format(endsAt)}`;
  return `${SCHEDULE_FORMAT.format(startsAt!)} → ${SCHEDULE_FORMAT.format(endsAt!)}`;
}

/**
 * Why a banner is not currently on screen, or null when it is showing.
 *
 * Active-but-scheduled banners are the confusing case — this is what stops an
 * admin wondering why a banner they just switched on is nowhere to be seen.
 */
export function hiddenReason(
  isActive: boolean,
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date = new Date(),
): string | null {
  if (!isActive) return "Inactive";
  if (startsAt && startsAt > now) return "Scheduled";
  if (endsAt && endsAt < now) return "Expired";
  return null;
}
