"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  CANCEL_REASON_LABEL,
  MAX_CANCEL_NOTE_LENGTH,
  cancellationReasons,
  type CancelAudience,
} from "@/lib/orders/cancellation";
import { OrderCancelReason } from "@/generated/prisma/enums";

/**
 * Choose why an order is being cancelled.
 *
 * Shared by the customer's receipt and the admin dashboard, which are offered
 * different reasons — `cancellationReasons` decides that from `audience`, so
 * the two lists cannot drift apart from the ones the action will accept.
 *
 * Drawn to sit inside a `TicketPanel`, because that is what an order is on both
 * pages: the same uppercase micro-label the ticket puts over "Order no." and
 * "Delivering to", and the same hairline-divided rows it lists the goods in. A
 * reason is picked by punching one of them, which is the gesture a paper ticket
 * already implies — hence a filled disc rather than a browser radio.
 *
 * Radios rather than a `<select>`: there are six options, one has to be chosen,
 * and a select would open with a plausible-looking first reason already showing
 * under the cursor. A list that starts with nothing punched is what makes this
 * a decision rather than a default someone clicked past.
 *
 * No `required` on the inputs. Validation is the action's, reported back
 * through `useActionState` in the same keyed shape as every other form here —
 * a native bubble would say "please select one of these options" in a voice
 * that is not the rest of the site's, and would not survive a submit from a
 * client with scripting disabled anyway.
 */
export function CancelReasonFieldset({
  audience,
  errors,
  disabled,
}: {
  audience: CancelAudience;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  // Held in state only to decide what is drawn as punched and whether the note
  // is shown. The value the action reads is the radio's own, off the FormData.
  const [reason, setReason] = useState<OrderCancelReason | null>(null);

  return (
    <div>
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Reason for cancelling
        </legend>

        {errors?.reason ? (
          <p role="alert" className="text-error mt-1.5 flex items-center gap-1.5 text-xs">
            <Icon name="error" size={16} />
            {errors.reason}
          </p>
        ) : (
          <p className="text-on-surface-variant mt-1 text-xs">
            {audience === "customer"
              ? "Pick the closest one — it helps us fix what went wrong."
              : "Recorded on the order, and shown to the customer."}
          </p>
        )}

        {/* The same hairline rows the ticket lists its goods in. */}
        <div className="divide-outline-variant/60 mt-3 divide-y">
          {cancellationReasons(audience).map((option) => {
            const checked = reason === option;

            return (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-center gap-3 py-2.5",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={option}
                  checked={checked}
                  onChange={() => setReason(option)}
                  className="sr-only"
                />

                {/* Punched, not ticked — the ticket's own notches are holes,
                    and this is the same gesture at reading size. */}
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150",
                    checked
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant",
                  )}
                >
                  {checked && <Icon name="check" size={14} />}
                </span>

                <span
                  className={cn(
                    "text-sm transition-colors duration-150",
                    checked ? "text-on-surface font-medium" : "text-on-surface-variant",
                  )}
                >
                  {CANCEL_REASON_LABEL[option]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Only under "Something else", which is the one reason the enum does not
          already describe. Mounted on selection so it cannot be filled in and
          then quietly submitted against a different reason. */}
      {reason === OrderCancelReason.OTHER && (
        <div className="border-outline-variant/60 mt-3 border-t pt-3">
          <label
            htmlFor="cancel-note"
            className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase"
          >
            In your words
          </label>
          <textarea
            id="cancel-note"
            name="note"
            rows={3}
            autoFocus
            disabled={disabled}
            maxLength={MAX_CANCEL_NOTE_LENGTH}
            aria-invalid={Boolean(errors?.note) || undefined}
            className={cn(
              "text-on-surface caret-primary mt-1.5 w-full resize-y rounded-sm border bg-transparent px-3 py-2 text-sm",
              "transition-colors duration-200 focus:outline-none",
              errors?.note
                ? "border-error focus:border-error"
                : "border-outline-variant focus:border-primary",
            )}
          />
          {errors?.note && (
            <p role="alert" className="text-error mt-1.5 flex items-center gap-1.5 text-xs">
              <Icon name="error" size={16} />
              {errors.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
