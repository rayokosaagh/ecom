"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  CANCEL_REASON_LABEL,
  MAX_CANCEL_NOTE_LENGTH,
  cancellationReasons,
} from "@/lib/orders/cancellation";
import { transitionLabel } from "@/lib/orders/transitions";
import { OrderCancelReason, OrderStatus } from "@/generated/prisma/enums";

/**
 * What you can do to a selection, and the pause before you do it.
 *
 * Every action here confirms first. Not because the individual moves are
 * dangerous — one of them is an export — but because the *count* is the part
 * nobody checks: the difference between shipping eight orders and shipping
 * eighty is one stray click on a select-all, and the confirmation is where that
 * number gets read out loud.
 *
 * Inline rather than a modal, matching `ConfirmDelete`. There is no dialog
 * component in this codebase, and a bar that already sits above everything does
 * not need to summon a second layer to ask one question.
 */

type Step =
  | { kind: "idle" }
  | { kind: "advance"; to: OrderStatus }
  | { kind: "cancel" };

const ACTION =
  "state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-transform duration-[var(--duration-short2)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-[0.38]";

export function BulkBar({
  count,
  busy,
  exportHref,
  onAdvance,
  onCancel,
  onClear,
}: {
  count: number;
  busy: boolean;
  /** A plain link, so the browser does the download — see the export route. */
  exportHref: string;
  onAdvance: (to: OrderStatus) => void;
  onCancel: (reason: OrderCancelReason, note: string) => void;
  onClear: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [reason, setReason] = useState<OrderCancelReason | "">("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const orders = `${count} order${count === 1 ? "" : "s"}`;

  const reset = () => {
    setStep({ kind: "idle" });
    setReason("");
    setNote("");
    setNoteError(null);
  };

  const confirmCancel = () => {
    if (!reason) {
      setNoteError("Choose a reason for cancelling");
      return;
    }
    // Mirrors `parseCancellation`, which is the thing that actually enforces it
    // — this is only here so the answer comes back without a round trip.
    if (reason === OrderCancelReason.OTHER && !note.trim()) {
      setNoteError("Tell us briefly what happened");
      return;
    }
    onCancel(reason, note.trim());
    reset();
  };

  return (
    <div
      // Above the pager and the table's own scroll pane, and out of the way of
      // the row it is describing.
      className="sticky bottom-4 z-20"
      role="region"
      aria-label="Bulk actions"
    >
      <div className="bg-inverse-surface text-inverse-on-surface shadow-elevation-3 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
        {step.kind === "idle" && (
          <>
            <span className="text-sm font-medium tabular-nums">{orders} selected</span>

            <span className="ml-auto flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={ACTION}
                disabled={busy}
                onClick={() => setStep({ kind: "advance", to: OrderStatus.PAID })}
              >
                <Icon name="payments" size={18} />
                Mark as paid
              </button>

              <button
                type="button"
                className={ACTION}
                disabled={busy}
                onClick={() => setStep({ kind: "advance", to: OrderStatus.SHIPPED })}
              >
                <Icon name="local_shipping" size={18} />
                Mark as shipped
              </button>

              <a href={exportHref} className={ACTION}>
                <Icon name="download" size={18} />
                Export selected
              </a>

              <button
                type="button"
                className={cn(ACTION, "text-error")}
                disabled={busy}
                onClick={() => setStep({ kind: "cancel" })}
              >
                <Icon name="cancel" size={18} />
                Cancel selected
              </button>

              <button
                type="button"
                onClick={onClear}
                aria-label="Clear selection"
                title="Clear selection"
                className="state-layer ml-1 grid size-9 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="close" size={18} />
              </button>
            </span>
          </>
        )}

        {step.kind === "advance" && (
          <>
            <span className="text-sm">
              {transitionLabel(step.to)} — {orders}?{" "}
              <span className="opacity-70">
                {/* The count is the whole point of asking, so it is not the only
                    thing said quietly. */}
                Orders that cannot make that move are skipped and listed.
              </span>
            </span>

            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className={cn(ACTION, "bg-primary text-on-primary")}
                disabled={busy}
                onClick={() => {
                  onAdvance(step.to);
                  reset();
                }}
              >
                Confirm
              </button>
              <button type="button" className={ACTION} onClick={reset}>
                Back
              </button>
            </span>
          </>
        )}

        {step.kind === "cancel" && (
          <div className="w-full space-y-3">
            <p className="text-sm">
              Cancel {orders} and return their stock? Every one of them is told the same
              reason.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 sm:max-w-xs">
                <span className="mb-1 block text-xs opacity-80">Reason</span>
                <select
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value as OrderCancelReason);
                    setNoteError(null);
                  }}
                  className="border-inverse-on-surface/40 h-9 w-full rounded-full border bg-transparent px-3 text-sm outline-none focus-visible:outline-2"
                >
                  <option value="">Choose a reason…</option>
                  {cancellationReasons("admin").map((value) => (
                    // Options inherit the page's colours, not the bar's dark
                    // ones — the native menu is drawn by the OS.
                    <option key={value} value={value} className="text-on-surface">
                      {CANCEL_REASON_LABEL[value]}
                    </option>
                  ))}
                </select>
              </label>

              {reason === OrderCancelReason.OTHER && (
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs opacity-80">What happened?</span>
                  <input
                    type="text"
                    value={note}
                    maxLength={MAX_CANCEL_NOTE_LENGTH}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setNoteError(null);
                    }}
                    className="border-inverse-on-surface/40 h-9 w-full rounded-full border bg-transparent px-3 text-sm outline-none focus-visible:outline-2"
                  />
                </label>
              )}

              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className={cn(ACTION, "bg-error text-on-error")}
                  disabled={busy}
                  onClick={confirmCancel}
                >
                  Cancel {orders}
                </button>
                <button type="button" className={ACTION} onClick={reset}>
                  Back
                </button>
              </span>
            </div>

            {noteError && (
              <p role="alert" className="text-sm opacity-90">
                {noteError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
