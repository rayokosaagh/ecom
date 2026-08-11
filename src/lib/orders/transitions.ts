import { OrderStatus } from "@/generated/prisma/enums";

/**
 * Which moves are allowed from each status.
 *
 * A table rather than scattered `if`s, so the whole lifecycle is legible in one
 * place — and so an illegal transition is impossible to express rather than
 * merely unlikely. Terminal states have no exits: a shipped order is history,
 * and cancelling one would silently restore stock that has already left.
 *
 * Kept out of `lib/actions/orders` because every export of a `"use server"`
 * module has to be an async server action — a plain lookup like this one
 * breaks the whole module if it lives there.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  // Shipped is no longer the end of the road, but it is still one-way: an order
  // that has left the building cannot be cancelled, because that would restore
  // stock which is in a van. Delivery is the only thing left that can happen.
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status] ?? [];
}

/**
 * The one move *forward* from here, if there is one.
 *
 * Every status has at most a single way onward — cancelling is the other exit,
 * and it is not progress. That makes "advance this order" a well-defined thing
 * a list can offer on a row or across a selection, without the caller having to
 * know that pending goes to paid rather than straight to shipped.
 *
 * Derived from the same table rather than written out again, so a lifecycle
 * change cannot leave a quick-action button pointing at a move the server will
 * refuse.
 */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  return allowedTransitions(status).find((to) => to !== OrderStatus.CANCELLED) ?? null;
}

/** How a move reads on a button: "Mark as shipped". */
export function transitionLabel(to: OrderStatus): string {
  return `Mark as ${to.toLowerCase()}`;
}

/**
 * Whether the customer may cancel this themselves.
 *
 * Only before payment. Once an order is paid, cancelling is a refund, and
 * deciding to give money back is the shop's call rather than a button on a
 * receipt — the admin can still cancel a paid order from the dashboard.
 *
 * Narrower than `allowedTransitions` on purpose: that table says what the
 * lifecycle permits, this says what a customer is permitted to do to it.
 */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING;
}
