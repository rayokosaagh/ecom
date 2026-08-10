"use client";

import { useActionState, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { TicketPanel } from "@/components/ui/TicketPanel";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { cn } from "@/lib/cn";
import { CancelReasonFieldset } from "./CancelReasonFieldset";
import {
  cancelOrderAsAdmin,
  updateOrderStatus,
  type OrderActionState,
} from "@/lib/actions/orders";
import { OrderStatus as Status, type FulfilmentMethod, type OrderStatus } from "@/generated/prisma/enums";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";

const LABEL: Record<string, string> = {
  PAID: "Mark paid",
  SHIPPED: "Mark shipped",
  CANCELLED: "Cancel order",
};

const INITIAL: OrderActionState = {};

/** The uppercase micro-label the ticket heads each of its blocks with. */
const MICRO = "text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase";

/**
 * The controls that move an order through its lifecycle.
 *
 * Drawn as a counterfoil to the order ticket above it — same notches, same
 * perforation, controls on the tear-off stub. It sits in the same column
 * directly under the receipt, and as a plain card it read as a different kind
 * of object attached to one.
 *
 * Which moves are offered is decided on the server — `allowedTransitions` — and
 * passed in, so this component cannot invent a transition the action would
 * reject. The action re-checks anyway; this only decides what to draw.
 *
 * Cancelling goes through a different action from the forward moves, because it
 * has to carry a reason. That is why there are two pieces of state here: a
 * transition for the routine moves, and a form for the one that asks a question
 * first.
 */
export function OrderStatusActions({
  orderId,
  status,
  fulfilment,
  transitions,
  surface,
}: {
  orderId: string;
  status: OrderStatus;
  /** Renames the SHIPPED move for a collection order. */
  fulfilment: FulfilmentMethod;
  transitions: OrderStatus[];
  /** Passed through to the ticket — the dashboard's shell is near-white, so
      its page overrides the default the way it does for `OrderDetail`. */
  surface?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OrderActionState>({});
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelOrderAsAdmin.bind(null, orderId),
    INITIAL,
  );

  const run = (next: OrderStatus) => {
    setConfirming(false);
    startTransition(async () => {
      setResult(await updateOrderStatus(orderId, next));
    });
  };

  // Whichever path last said something is what gets shown.
  const shown: OrderActionState =
    cancelState.message || cancelState.success ? cancelState : result;
  const busy = pending || cancelPending;

  if (transitions.length === 0) {
    return (
      <TicketPanel
        surface={surface}
        stub={
          <>
            <p className={MICRO}>Status</p>
            <OrderStatusBadge status={status} fulfilment={fulfilment} />
          </>
        }
      >
        <div className="text-on-surface-variant flex items-center gap-2 px-5 pt-5 pb-5 text-sm">
          <Icon name="lock" size={18} />
          {/* Terminal states have no exits — see the transition table. */}
          This order is {status.toLowerCase()} and can no longer be changed.
        </div>
      </TicketPanel>
    );
  }

  const messages = (
    <>
      {shown.message && (
        <p
          role="alert"
          className="bg-error-container text-on-error-container mb-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <Icon name="error" size={18} />
          {shown.message}
        </p>
      )}
      {shown.success && (
        <p
          role="status"
          className="bg-tertiary-container text-on-tertiary-container mb-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <Icon name="check_circle" size={18} />
          {shown.success}
        </p>
      )}
    </>
  );

  // Cancelling returns stock, notifies the customer and has to record why, so
  // it opens a form. The forward moves are routine and stay one click.
  if (confirming && transitions.some((next) => next === "CANCELLED")) {
    return (
      <form action={cancelAction} noValidate>
        <TicketPanel
          surface={surface}
          stub={
            <>
              <p className={cn(MICRO, "hidden sm:block")}>Returns stock</p>
              {/* `ml-auto` because the label beside it is hidden on small
                  screens, and `justify-between` would otherwise strand these
                  at the left edge. */}
              <div className="ml-auto flex min-w-0 shrink items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={cancelPending}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] h-10 shrink-0 rounded-full px-4 text-sm transition-colors duration-150 focus-visible:outline-2 disabled:opacity-60"
                >
                  Keep it
                </button>
                <button
                  type="submit"
                  disabled={cancelPending}
                  className="bg-error text-on-error inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  {cancelPending && (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  Cancel order
                </button>
              </div>
            </>
          }
        >
          <div className="px-5 pt-5 pb-5">
            {messages}
            <CancelReasonFieldset
              audience="admin"
              errors={cancelState.errors}
              disabled={cancelPending}
            />
          </div>
        </TicketPanel>
      </form>
    );
  }

  return (
    <TicketPanel
      surface={surface}
      stub={
        <>
          <p className={cn(MICRO, "hidden sm:block")}>Update status</p>
          <div className="ml-auto flex min-w-0 shrink flex-wrap items-center justify-end gap-2">
            {transitions.map((next) => {
              const destructive = next === "CANCELLED";

              return (
                <button
                  key={next}
                  type="button"
                  onClick={() => (destructive ? setConfirming(true) : run(next))}
                  disabled={busy}
                  className={cn(
                    "state-layer inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60",
                    destructive
                      ? "border-error text-error border"
                      : "bg-primary text-on-primary",
                  )}
                >
                  {pending && (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {/* Both travelling states read differently for a collection
                      order, so both defer to the fulfilment labels rather than
                      the flat table. */}
                  {next === Status.SHIPPED
                    ? fulfilmentLabels(fulfilment).markShipped
                    : next === Status.DELIVERED
                      ? fulfilmentLabels(fulfilment).markDelivered
                      : (LABEL[next] ?? next)}
                </button>
              );
            })}
          </div>
        </>
      }
    >
      <div className="px-5 pt-5 pb-5">
        {messages}
        <p className={MICRO}>Fulfilment</p>
        <p className="text-on-surface-variant mt-1.5 text-sm">
          The customer is notified whenever the status changes.
        </p>
      </div>
    </TicketPanel>
  );
}
