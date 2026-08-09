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
  [OrderStatus.SHIPPED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status] ?? [];
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
