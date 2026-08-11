"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { notifyAdmins, notifyUser } from "@/lib/notifications/service";
import { sendOrderEmailSafely } from "@/lib/orders/email";
import { orderThumbnail } from "@/lib/orders/service";
import { orderReference } from "@/lib/orders/reference";
import { formatPrice } from "@/lib/products/format";
import { allowedTransitions, customerCanCancel } from "@/lib/orders/transitions";
import {
  describeCancellation,
  parseCancellation,
  type CancellationInput,
} from "@/lib/orders/cancellation";
import { NotificationType, OrderStatus } from "@/generated/prisma/enums";

export type OrderActionState = {
  message?: string;
  success?: string;
  /** Keyed by field, the way every other form in this codebase reports. */
  errors?: Record<string, string>;
};

/** What the customer is told when their order moves. */
const CUSTOMER_NOTICE: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  [OrderStatus.PAID]: {
    title: "Payment confirmed",
    body: "We have your payment and are preparing your order.",
  },
  [OrderStatus.SHIPPED]: {
    title: "Order shipped",
    body: "Your order is on its way.",
  },
  [OrderStatus.DELIVERED]: {
    title: "Order delivered",
    body: "Your order has arrived. Tell us what you thought of it.",
  },
  [OrderStatus.CANCELLED]: {
    title: "Order cancelled",
    body: "Your order was cancelled. Anything paid will be refunded.",
  },
};

function revalidateOrderViews(id: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  // Stock changed, so the storefront's availability did too.
  revalidatePath("/products", "layout");
}

/** The shape both callers read an order in, so the move can be shared. */
type MovableOrder = {
  id: string;
  status: OrderStatus;
  items: { productId: string | null; variantId: string | null; quantity: number }[];
};

/**
 * Move an order to `next`, returning stock if that means cancelling.
 *
 * Shared by the admin action and the customer's own cancel. Deliberately one
 * implementation: two copies of "give the units back" is how one of them ends
 * up restoring to the product when the line was bought as a variant, and
 * nobody notices until the counts are wrong.
 *
 * Returns "CONCURRENT_UPDATE" when someone else moved it first.
 */
async function moveStatus(
  order: MovableOrder,
  next: OrderStatus,
  cancellation?: CancellationInput,
): Promise<"CONCURRENT_UPDATE" | undefined> {
  const restocking = next === OrderStatus.CANCELLED;

  return prisma
    .$transaction(async (tx) => {
      // The status is moved with the *current* status in the where clause. If
      // anyone got there first the update matches nothing, and the restock
      // below never runs — which is what stops a double cancellation from
      // returning the same units twice and inflating inventory.
      //
      // The reason is written by that same update rather than a second one, so
      // it lands under the same guard: whoever loses the race records neither
      // the move nor a reason for it, instead of overwriting the reason of the
      // cancellation that actually happened.
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: next,
          ...(cancellation
            ? { cancelReason: cancellation.reason, cancelNote: cancellation.note }
            : {}),
        },
      });
      if (moved.count === 0) throw new Error("CONCURRENT_UPDATE");

      if (!restocking) return undefined;

      // Give the units back to whatever they were taken from. Checkout claims
      // from the variant when the line had one and from the product otherwise,
      // so cancelling has to mirror that exactly.
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        } else if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        // A line whose product and variant have both been deleted has nothing
        // to restore to, and is skipped rather than failing the cancellation.
      }

      return undefined;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (message === "CONCURRENT_UPDATE") return "CONCURRENT_UPDATE" as const;
      throw error;
    });
}

/**
 * Move an order forward through its lifecycle.
 *
 * Cancelling is deliberately *not* one of the moves this makes. A cancellation
 * has to record why, and a reason cannot be collected by a function whose only
 * input is the status to move to — `cancelOrderAsAdmin` is that path. Refusing
 * it here rather than relying on the UI not to offer it is the point: a server
 * action is a public POST endpoint, so "the button submits a reason" is not
 * what makes the reason mandatory. This is.
 */
export async function updateOrderStatus(
  id: string,
  next: OrderStatus,
): Promise<OrderActionState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  if (next === OrderStatus.CANCELLED) {
    return { message: "Cancelling an order needs a reason — use the cancel form." };
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      totalCents: true,
      items: {
        select: { productId: true, variantId: true, quantity: true, name: true },
      },
    },
  });

  if (!order) return { message: "That order no longer exists." };

  if (!allowedTransitions(order.status).includes(next)) {
    return {
      message: `An order that is ${order.status.toLowerCase()} cannot be marked ${next.toLowerCase()}.`,
    };
  }

  const outcome = await moveStatus(order, next);

  // Someone else moved it first. Reporting rather than retrying is deliberate:
  // the other admin may have cancelled it, and silently re-applying this
  // change would undo their decision.
  if (outcome === "CONCURRENT_UPDATE") {
    return { message: "Someone else updated this order just now — reload to see it." };
  }

  await announceToCustomer(order, next);

  revalidateOrderViews(id);

  return { success: `Order marked ${next.toLowerCase()}.` };
}

/** Tell the customer their order moved, by both channels, once. */
async function announceToCustomer(
  order: { id: string; userId: string; totalCents: number },
  next: OrderStatus,
) {
  const notice = CUSTOMER_NOTICE[next];
  if (!notice) return;

  // Both channels for the same event, and deliberately the same wording —
  // `HEADLINES` in `lib/orders/email-template` mirrors this table, so a
  // customer who sees the in-app notice and the email is not told two
  // different things. Deferred, so a mail provider cannot fail the move.
  after(() => sendOrderEmailSafely(order.id, next));

  await notifyUser(order.userId, {
    type: NotificationType.ORDER,
    title: notice.title,
    description: `${notice.body} · ${formatPrice(order.totalCents)}`,
    href: `/orders/${order.id}`,
    imageUrl: await orderThumbnail(order.id),
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk moves                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The most orders one request may move.
 *
 * A ceiling rather than a page size — the list offers at most 100 at a time, so
 * nothing legitimate comes close. It is here because a server action is a public
 * POST endpoint and the array arrives from the client: without it, one request
 * could walk the entire table.
 */
const MAX_BULK = 200;

export type BulkOrderResult = {
  moved: number;
  /** Named, not counted: "2 skipped" invites the question this answers. */
  skipped: { reference: string; why: string }[];
  message?: string;
  success?: string;
};

/**
 * Why one order in a selection could not make the move.
 *
 * Each order is re-checked individually against the transition table rather
 * than the selection being validated as a block. A selection is made against
 * the list as it was *rendered*, and by the time the button is pressed another
 * admin may have shipped one of them — so "they were all pending when I ticked
 * them" is not a fact the server can accept.
 */
function bulkSkipReason(from: OrderStatus, to: OrderStatus): string {
  if (from === to) return `already ${to.toLowerCase()}`;
  return `still ${from.toLowerCase()}`;
}

/**
 * Move a selection of orders forward.
 *
 * Not one transaction. Each order moves in its own, so an order somebody else
 * touched a second ago is skipped and reported rather than rolling back the
 * forty that were fine — a bulk action that is all-or-nothing on a live list is
 * an action that fails whenever the shop is busy.
 *
 * Cancelling is not reachable here, for the same reason `updateOrderStatus`
 * refuses it: it needs a reason. `bulkCancelOrders` is that path.
 */
export async function bulkAdvanceOrders(
  ids: string[],
  next: OrderStatus,
): Promise<BulkOrderResult> {
  await requireAdmin();

  if (next === OrderStatus.CANCELLED) {
    return { moved: 0, skipped: [], message: "Cancelling needs a reason — use Cancel selected." };
  }

  const unique = [...new Set(ids)].slice(0, MAX_BULK);
  if (unique.length === 0) {
    return { moved: 0, skipped: [], message: "Nothing was selected." };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      status: true,
      userId: true,
      totalCents: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });

  const skipped: BulkOrderResult["skipped"] = [];
  const movedIds: string[] = [];

  for (const order of orders) {
    const reference = orderReference(order.id);

    if (!allowedTransitions(order.status).includes(next)) {
      skipped.push({ reference, why: bulkSkipReason(order.status, next) });
      continue;
    }

    const outcome = await moveStatus(order, next);
    if (outcome === "CONCURRENT_UPDATE") {
      skipped.push({ reference, why: "changed while you were choosing" });
      continue;
    }

    movedIds.push(order.id);
    await announceToCustomer(order, next);
  }

  revalidateBulk(movedIds);

  return {
    moved: movedIds.length,
    skipped,
    success: movedIds.length > 0 ? summarise(movedIds.length, next) : undefined,
    message: movedIds.length === 0 ? `Nothing could be marked ${next.toLowerCase()}.` : undefined,
  };
}

/**
 * Cancel a selection, recording one reason across all of them.
 *
 * One reason for the batch is the honest shape: an admin cancelling forty
 * orders at once is cancelling them *for* something — a supplier fell through,
 * a fraud pattern — and asking forty times would only teach them to pick the
 * first option. Where the reasons genuinely differ, the single-order form on
 * the detail page still exists.
 */
export async function bulkCancelOrders(
  ids: string[],
  formData: FormData,
): Promise<BulkOrderResult> {
  await requireAdmin();

  // Validated before anything is read, let alone moved: a request that names no
  // reason must change nothing at all.
  const parsed = parseCancellation(formData, "admin");
  if (!parsed.ok) {
    return { moved: 0, skipped: [], message: parsed.errors.reason ?? parsed.errors.note };
  }

  const unique = [...new Set(ids)].slice(0, MAX_BULK);
  if (unique.length === 0) {
    return { moved: 0, skipped: [], message: "Nothing was selected." };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      status: true,
      userId: true,
      totalCents: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });

  const skipped: BulkOrderResult["skipped"] = [];
  const movedIds: string[] = [];

  for (const order of orders) {
    const reference = orderReference(order.id);

    if (!allowedTransitions(order.status).includes(OrderStatus.CANCELLED)) {
      skipped.push({ reference, why: `already ${order.status.toLowerCase()}` });
      continue;
    }

    const outcome = await moveStatus(order, OrderStatus.CANCELLED, parsed.data);
    if (outcome === "CONCURRENT_UPDATE") {
      skipped.push({ reference, why: "changed while you were choosing" });
      continue;
    }

    movedIds.push(order.id);
    await announceToCustomer(order, OrderStatus.CANCELLED);
  }

  revalidateBulk(movedIds);

  return {
    moved: movedIds.length,
    skipped,
    success:
      movedIds.length > 0
        ? `${movedIds.length} order${movedIds.length === 1 ? "" : "s"} cancelled and stock returned.`
        : undefined,
    message: movedIds.length === 0 ? "Nothing could be cancelled." : undefined,
  };
}

function summarise(count: number, next: OrderStatus): string {
  return `${count} order${count === 1 ? "" : "s"} marked ${next.toLowerCase()}.`;
}

/**
 * Revalidate once for the batch.
 *
 * The list and the storefront are invalidated a single time however many orders
 * moved; only the per-order receipts need naming individually.
 */
function revalidateBulk(ids: string[]) {
  if (ids.length === 0) return;

  revalidatePath("/admin/orders");
  revalidatePath("/orders");
  revalidatePath("/products", "layout");

  for (const id of ids) {
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath(`/orders/${id}`);
  }
}

/**
 * Cancel an order from the dashboard, recording why.
 *
 * Split out of `updateOrderStatus` rather than bolted onto it: this is the only
 * move that returns stock, notifies both sides and demands an explanation, and
 * it takes a `FormData` because a reason is chosen on a form. Bound to an id by
 * the caller, then driven by `useActionState` — the same shape the admin's
 * other forms use.
 *
 * The reason is validated *before* anything moves, so a cancellation that names
 * no reason changes nothing at all.
 */
export async function cancelOrderAsAdmin(
  id: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();

  // "admin" comes from the guard above, never from the form — see the note on
  // `parseCancellation`. A customer posting here is stopped by `requireAdmin`
  // before the audience is ever decided.
  const parsed = parseCancellation(formData, "admin");
  if (!parsed.ok) return { errors: parsed.errors };

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      totalCents: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });

  if (!order) return { message: "That order no longer exists." };

  if (!allowedTransitions(order.status).includes(OrderStatus.CANCELLED)) {
    return {
      message: `An order that is ${order.status.toLowerCase()} can no longer be cancelled.`,
    };
  }

  const outcome = await moveStatus(order, OrderStatus.CANCELLED, parsed.data);
  if (outcome === "CONCURRENT_UPDATE") {
    return { message: "Someone else updated this order just now — reload to see it." };
  }

  await announceToCustomer(order, OrderStatus.CANCELLED);

  revalidateOrderViews(id);

  return { success: "Order cancelled and stock returned." };
}

/**
 * Cancel your own order.
 *
 * Scoped to the signed-in user *inside the query*, so another customer's id
 * simply finds nothing — the same authorization boundary the receipt page
 * uses, rather than a check sitting beside the query that could be forgotten.
 *
 * Only while the order is still pending; see `customerCanCancel`. Stock goes
 * back through the same path an admin cancellation uses, so the two cannot
 * drift apart.
 */
export async function cancelMyOrder(
  id: string,
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireUser();

  // Checked before the order is even read: there is no point racing to cancel
  // something when the request does not say why.
  const parsed = parseCancellation(formData, "customer");
  if (!parsed.ok) return { errors: parsed.errors };

  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      totalCents: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });

  if (!order) return { message: "That order no longer exists." };

  if (!customerCanCancel(order.status)) {
    return {
      message:
        order.status === OrderStatus.CANCELLED
          ? "This order is already cancelled."
          : "This order has moved too far along to cancel here \u2014 get in touch and we will sort it out.",
    };
  }

  const outcome = await moveStatus(order, OrderStatus.CANCELLED, parsed.data);
  if (outcome === "CONCURRENT_UPDATE") {
    return { message: "This order changed a moment ago \u2014 reload to see where it is." };
  }

  /**
   * Emailed even though the customer did this themselves.
   *
   * The comment below still holds for the *notification* — a bell badge about
   * your own click is noise. An email is a different thing: it is the written
   * record that the cancellation happened and that anything paid is coming
   * back, which is exactly what someone wants in writing. So the two channels
   * deliberately disagree here.
   */
  after(() => sendOrderEmailSafely(order.id, OrderStatus.CANCELLED));

  // The shop is told; the customer is not, because they are the one who did it
  // and a notification about your own click is noise.
  //
  // The reason rides along in the description, because it is the part the shop
  // can act on — "delivery is taking too long" three times in a week is worth
  // seeing in the bell without opening three orders.
  await notifyAdmins({
    type: NotificationType.ORDER,
    title: "Order cancelled by customer",
    description: `${user.name ?? user.email} cancelled ${formatPrice(
      order.totalCents,
    )} · ${describeCancellation(parsed.data.reason, parsed.data.note)}`,
    href: `/admin/orders/${order.id}`,
    imageUrl: await orderThumbnail(order.id),
  });

  revalidateOrderViews(id);

  return { success: "Order cancelled. Anything reserved has been released." };
}
