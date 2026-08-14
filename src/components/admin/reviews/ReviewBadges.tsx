import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { ReviewStatusValue } from "./types";

/**
 * The small labels that say what state a review is in.
 *
 * Shared by the card and the detail panel so the two cannot disagree about what
 * "Pending" looks like, and kept to the palette the rest of the dashboard
 * already uses: the container tints, never a new colour invented for a badge.
 *
 * Nothing is drawn for a published review. "Published" on every row is a column
 * of the same word down the page — the state worth marking is the one that is
 * *not* the norm, which is exactly what a badge is for.
 */

const STATUS_STYLES: Record<
  ReviewStatusValue,
  { label: string; icon: string; className: string } | null
> = {
  PUBLISHED: null,
  PENDING: {
    label: "Pending",
    icon: "schedule",
    className: "bg-secondary-container text-on-secondary-container",
  },
  HIDDEN: {
    label: "Hidden",
    icon: "visibility_off",
    className: "bg-error-container text-on-error-container",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ReviewStatusValue;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  if (!style) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        style.className,
        className,
      )}
    >
      <Icon name={style.icon} size={12} />
      {style.label}
    </span>
  );
}

/**
 * The verified-purchase mark, in the green the storefront already uses for it.
 *
 * Renders nothing when the badge was not earned — which is the whole point of
 * it. See `Review.verified`: it records whether this author bought *this*
 * product, snapshotted when the words were written.
 */
export function VerifiedBadge({
  verified,
  className,
}: {
  verified: boolean;
  className?: string;
}) {
  if (!verified) return null;

  return (
    <span
      className={cn("text-tertiary inline-flex items-center gap-1 text-xs", className)}
    >
      <Icon name="verified" size={13} />
      Verified purchase
    </span>
  );
}

/**
 * The flag, with how many people raised it.
 *
 * Amber-free on purpose: this dashboard has no warning colour of its own, and
 * inventing one for a badge would put a shade on the page that nothing else
 * uses. The error container is the existing "something is wrong here" surface,
 * carried at badge size rather than as an alert.
 */
export function ReportedBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        "bg-error-container text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon name="flag" size={12} filled />
      Reported
      {count > 1 && <span className="tabular-nums">· {count}</span>}
    </span>
  );
}
