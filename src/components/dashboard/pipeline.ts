import { OrderStatus } from "@/generated/prisma/enums";
import type { Segment } from "@/components/charts/StackedBar";
import type { PipelineCounts } from "@/lib/dashboard/metrics";

/**
 * How the order pipeline is coloured.
 *
 * Three states of one hue, getting stronger: pending → paid → shipped is a
 * sequence, and colouring a sequence with unrelated hues throws away the one
 * thing the reader most wants to see. Cancelled leaves the ramp for the
 * reserved critical colour, because it is not a further stage — it is where an
 * order stops.
 *
 * The icons are the same ones `OrderStatusBadge` uses, so a status looks like
 * itself wherever it appears — and they are what carries the meaning for
 * anyone the colour does not reach.
 *
 * Values are `var(...)` rather than hexes so both schemes are served by one
 * table: the tokens themselves flip, and the ramp inverts with them so
 * "further along is more prominent" survives the switch to dark.
 */
const LOOK: Record<OrderStatus, { label: string; icon: string; color: string }> = {
  [OrderStatus.PENDING]: {
    label: "Pending",
    icon: "schedule",
    color: "var(--color-chart-step-1)",
  },
  [OrderStatus.PAID]: {
    label: "Paid",
    icon: "payments",
    color: "var(--color-chart-step-2)",
  },
  [OrderStatus.SHIPPED]: {
    label: "Shipped",
    icon: "local_shipping",
    color: "var(--color-chart-step-3)",
  },
  [OrderStatus.CANCELLED]: {
    label: "Cancelled",
    icon: "cancel",
    color: "var(--color-chart-critical)",
  },
};

/** Pipeline order, not enum order — the bar reads left to right as the journey. */
const ORDER: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.CANCELLED,
];

export function pipelineSegments(counts: PipelineCounts): Segment[] {
  return ORDER.map((status) => ({ ...LOOK[status], value: counts[status] }));
}

export function statusLabel(status: OrderStatus): string {
  return LOOK[status].label;
}
