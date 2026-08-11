import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { FLAG_SHAPE, TONE_CONTAINER } from "@/lib/ui/tone";

/**
 * "This one has been waiting too long."
 *
 * Takes the already-computed age rather than a timestamp, so it renders the
 * same inside a server component and inside the client table — and so the
 * decision about what counts as late lives in `pendingAge`, once, rather than
 * in whichever component happened to be rendering. `OrderRow.overdue` is null
 * until the threshold is crossed, so a caller spreading it gets nothing at all
 * on a fresh order.
 *
 * That silence is the design. A flag on every pending row is a flag on no row;
 * only the late ones are marked, so the amber in the column is a count of the
 * work that is actually overdue.
 *
 * It sits *beside* the status badge rather than recolouring it — the order is
 * still pending, and a pill that changed colour with age would be claiming the
 * status had changed when it had not. The age is spelled out because "amber" is
 * not a duration, and a reader who takes no colour from the page still gets the
 * number.
 */
export function PendingAgeFlag({
  overdue,
  className,
}: {
  overdue: { short: string; long: string } | null;
  className?: string;
}) {
  if (!overdue) return null;

  return (
    <span
      title={overdue.long}
      className={cn(FLAG_SHAPE, TONE_CONTAINER.warning, "tabular-nums", className)}
    >
      <Icon name="warning" size={12} />
      <span aria-hidden>{overdue.short}</span>
      <span className="sr-only">{overdue.long}</span>
    </span>
  );
}
