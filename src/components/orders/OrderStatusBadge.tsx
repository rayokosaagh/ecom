import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";
import type { FulfilmentMethod, OrderStatus } from "@/generated/prisma/enums";

/**
 * Colour carries meaning here, so it is not decorative: cancelled reads as an
 * error, shipped as a success, and the two in-flight states as neutral. The
 * icon repeats it for anyone who cannot use the colour.
 */
const LOOK: Record<OrderStatus, { label: string; icon: string; className: string }> = {
  PENDING: {
    label: "Pending",
    icon: "schedule",
    className: "bg-surface-container-highest text-on-surface-variant",
  },
  PAID: {
    label: "Paid",
    icon: "payments",
    className: "bg-secondary-container text-on-secondary-container",
  },
  SHIPPED: {
    label: "Shipped",
    icon: "local_shipping",
    className: "bg-tertiary-container text-on-tertiary-container",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: "cancel",
    className: "bg-error-container text-on-error-container",
  },
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
  const look = LOOK[status];

  // "Shipped" on an order the customer is coming to collect sends them looking
  // for a tracking number that will never exist. Only the wording and the glyph
  // change — the status, and everything computed from it, is untouched.
  const shipped = status === "SHIPPED" && fulfilment;
  const labels = shipped ? fulfilmentLabels(fulfilment) : null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        look.className,
        className,
      )}
    >
      <Icon name={labels?.icon ?? look.icon} size={14} />
      {labels?.shipped ?? look.label}
    </span>
  );
}
