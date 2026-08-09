"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { TicketBarcode, TicketPanel } from "@/components/ui/TicketPanel";
import { CancelReasonFieldset } from "./CancelReasonFieldset";
import { cancelMyOrder, type OrderActionState } from "@/lib/actions/orders";

const INITIAL: OrderActionState = {};

/**
 * The customer's own cancel, on their receipt.
 *
 * Shaped as a second ticket below the order — the counterfoil to it. That is
 * not decoration: this control sits directly under the receipt in the same
 * column, and drawn as an ordinary card it read as a different kind of object
 * bolted to the bottom of one. Same notches, same perforation, same tear-off
 * stub, so cancelling looks like part of the ticket rather than a form about
 * it. The action lives on the stub, which is the half of a real ticket that
 * gets torn away.
 *
 * Two steps, because this is not undoable: cancelling puts the stock back and
 * there is no "un-cancel" transition to return along. The second step is the
 * reason form rather than a bare "are you sure" — which is a better confirm
 * than the question was, because choosing a reason is a deliberate act and
 * cannot be clicked through on reflex.
 *
 * Only rendered while the order is still pending — the page decides that from
 * `customerCanCancel`, and the action re-checks it.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  // Bound to the id, so the form only ever submits the reason. Same shape as
  // the admin and FAQ forms.
  const [result, formAction, pending] = useActionState(
    cancelMyOrder.bind(null, orderId),
    INITIAL,
  );

  // Once it has worked the control is gone on the next render anyway, but the
  // page has to come back from the server first — so say so meanwhile.
  if (result.success) {
    return (
      <TicketPanel
        stub={
          <>
            <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              Cancelled
            </p>
            <TicketBarcode
              seed={orderId}
              className="text-on-surface-variant/70 hidden sm:flex"
            />
          </>
        }
      >
        <div className="text-on-surface flex items-center gap-2 px-5 pt-5 pb-5 text-sm">
          <Icon name="check_circle" size={18} className="text-tertiary" />
          {result.success}
        </div>
      </TicketPanel>
    );
  }

  if (!confirming) {
    return (
      <TicketPanel
        stub={
          <>
            <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              Changed your mind?
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="border-error text-error state-layer inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              <Icon name="cancel" size={18} />
              Cancel this order
            </button>
          </>
        }
      >
        <div className="px-5 pt-5 pb-5">
          <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
            Cancellation
          </p>
          <p className="text-on-surface-variant mt-1.5 text-sm">
            You can cancel while an order is still pending. Once it has been paid,
            get in touch and we will sort it out.
          </p>
        </div>
      </TicketPanel>
    );
  }

  return (
    <form action={formAction} noValidate>
      <TicketPanel
        stub={
          <>
            <TicketBarcode
              seed={orderId}
              className="text-on-surface-variant/70 hidden sm:flex"
            />
            {/* `ml-auto` because the barcode beside it is hidden on small
                screens, and `justify-between` would otherwise strand these at
                the left edge. */}
            <div className="ml-auto flex min-w-0 shrink items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] h-10 shrink-0 rounded-full px-4 text-sm transition-colors duration-150 focus-visible:outline-2 disabled:opacity-60"
              >
                Keep it
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-error text-on-error inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                {pending && (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                Cancel order
              </button>
            </div>
          </>
        }
      >
        <div className="px-5 pt-5 pb-5">
          {result.message && (
            <p
              role="alert"
              className="bg-error-container text-on-error-container mb-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
            >
              <Icon name="error" size={18} />
              {result.message}
            </p>
          )}

          <CancelReasonFieldset
            audience="customer"
            errors={result.errors}
            disabled={pending}
          />
        </div>
      </TicketPanel>
    </form>
  );
}
