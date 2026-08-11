import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";
import { BADGE_SHAPE, TONE_CONTAINER, type Tone } from "@/lib/ui/tone";
import type { FulfilmentMethod, OrderStatus } from "@/generated/prisma/enums";

/**
 * Colour carries meaning here, so it is not decorative: cancelled reads as an
 * error, the two good end states as green, and the rest as in-flight. The icon
 * repeats it for anyone who cannot use the colour.
 *
 * Shipped and delivered share a hue and differ in weight — tonal green while it
 * is still moving, solid green once it has arrived. Two greens rather than a
 * green and a blue because "on its way" and "there" are the same kind of news;
 * a difference in *emphasis* says which of them is final without pretending
 * they are unrelated outcomes. The tick and the van still separate them for a
 * reader who takes no colour at all.
 */
export const STATUS_LOOK: Record<OrderStatus, { label: string; icon: string; tone: Tone }> = {
  PENDING: { label: "Pending", icon: "schedule", tone: "neutral" },
  PAID: { label: "Paid", icon: "payments", tone: "info" },
  SHIPPED: { label: "Shipped", icon: "local_shipping", tone: "success" },
  DELIVERED: { label: "Delivered", icon: "task_alt", tone: "done" },
  CANCELLED: { label: "Cancelled", icon: "cancel", tone: "danger" },
};

export function OrderStatusBadge({
  status,
  fulfilment,
  className,
}: {
  status: OrderStatus;
  /**
   * How the order travels. Only `SHIPPED` reads differently — every other
   * status means the same thing either way.
   *
   * Optional so callers that genuinely have no order in hand keep working; they
   * get the delivery wording, which is the default on the column.
   */
  fulfilment?: FulfilmentMethod;
  className?: string;
}) {
  const look = STATUS_LOOK[status];

  // "Shipped" on an order the customer is coming to collect sends them looking
  // for a tracking number that will never exist, and "Delivered" claims a
  // journey that never happened. Only the wording and the glyph change — the
  // status, and everything computed from it, is untouched.
  const travelling = (status === "SHIPPED" || status === "DELIVERED") && fulfilment;
  const labels = travelling ? fulfilmentLabels(fulfilment) : null;
  const wording = labels
    ? status === "SHIPPED"
      ? labels.shipped
      : labels.delivered
    : null;

  return (
    <span className={cn(BADGE_SHAPE, TONE_CONTAINER[look.tone], className)}>
      {/* The finished state keeps its own tick rather than borrowing the
          fulfilment glyph — a van on a completed order reads as in transit.
          Filled, too: on the one solid pill the glyph has the weight to carry
          it, and it is the second cue that this row is done rather than moving. */}
      <Icon
        name={status === "DELIVERED" ? look.icon : (labels?.icon ?? look.icon)}
        size={14}
        filled={status === "DELIVERED"}
      />
      {wording ?? look.label}
    </span>
  );
}
