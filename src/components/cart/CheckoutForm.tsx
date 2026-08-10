"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import {
  CheckoutSummary,
  type SummaryLine,
} from "@/components/cart/CheckoutSummary";
import { checkout, type CheckoutState } from "@/lib/actions/cart";
import { FulfilmentMethod, PaymentMethod } from "@/generated/prisma/enums";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { PaymentMark } from "@/components/checkout/PaymentMark";
import { SandboxNotice } from "@/components/checkout/SandboxNotice";
import { cn } from "@/lib/cn";

export interface ShippingValues {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  phone: string;
}

/** Where to collect from, as the admin typed it. */
export interface PickupDetails {
  address: string;
  hours: string;
  note: string;
}

export interface CheckoutSummaryData {
  items: SummaryLine[];
  count: number;
  subtotalCents: number;
  payableCents: number;
  discountCents: number;
  discountLabel: string | null;
}

/** One payment option, already judged against this basket on the server. */
export interface PaymentOption {
  method: PaymentMethod;
  label: string;
  blurb: string;
  icon: string;
  /** Set when the method exists but cannot be used right now. */
  unavailable: string | null;
}

const INITIAL: CheckoutState = {};

/**
 * Delivery details, and the button that actually places the order.
 *
 * One page rather than a wizard. There is exactly one thing to collect, and
 * splitting an address across steps adds clicks without reducing what has to be
 * typed — the summary sits beside it instead, so nothing is out of sight at the
 * moment of committing.
 *
 * The method chooser only appears when the shop actually has a counter. With
 * collection unavailable this renders exactly what it always did: an address
 * form, and a hidden field naming the only method there is.
 *
 * The address fieldset is **unmounted** rather than hidden when collection is
 * chosen. Hiding it would leave every field in the submitted payload, and a
 * half-typed address on a collection order is data nobody asked for that would
 * then have to be ignored by the parser and by every reader afterwards.
 */
export function CheckoutForm({
  values,
  summary,
  pickup,
  payments,
  sandbox,
}: {
  values: ShippingValues;
  summary: CheckoutSummaryData;
  /** Null when the shop offers no collection — see `pickupAvailable`. */
  pickup: PickupDetails | null;
  /** Every payment option, in the order they are offered. */
  payments: PaymentOption[];
  /** Whether the gateways point at their test environments. */
  sandbox: boolean;
}) {
  const [state, formAction, pending] = useActionState(checkout, INITIAL);
  const [method, setMethod] = useState<FulfilmentMethod>(
    FulfilmentMethod.DELIVERY,
  );

  const usable = payments.filter((option) => option.unavailable === null);
  const [payment, setPayment] = useState<PaymentMethod>(
    // Never starts on something that cannot be submitted.
    usable[0]?.method ?? PaymentMethod.COD,
  );

  const collecting = pickup !== null && method === FulfilmentMethod.PICKUP;
  const payingNow = PAYMENT_METHODS[payment]?.redirects ?? false;

  const options = [FulfilmentMethod.DELIVERY, FulfilmentMethod.PICKUP] as const;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
      <div className="space-y-6">
        {state.message && (
          <p
            role="alert"
            className="bg-error-container text-on-error-container flex items-start gap-2 rounded-md px-4 py-3 text-sm"
          >
            <Icon name="error" size={18} className="mt-px" />
            <span>{state.message}</span>
          </p>
        )}

        {pickup ? (
          <Card variant="outlined">
            <CardContent className="space-y-4">
              <h2 className="text-on-surface text-sm font-medium">
                How would you like it?
              </h2>

              {/* Real radios rather than buttons: this is a single choice from
                  a small set, which is what a radio group is, and it arrives in
                  the payload without JavaScript having to put it there. */}
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Delivery or collection</legend>

                {options.map((option) => {
                  const labels = fulfilmentLabels(option);
                  const selected = method === option;

                  return (
                    <label
                      key={option}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors duration-200",
                        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                        selected
                          ? "border-primary bg-primary-container/40"
                          : "border-outline-variant hover:bg-on-surface/[0.04]",
                      )}
                    >
                      <input
                        type="radio"
                        name="fulfilment"
                        value={option}
                        checked={selected}
                        onChange={() => setMethod(option)}
                        className="accent-primary mt-0.5 size-4"
                      />
                      <span className="min-w-0">
                        <span className="text-on-surface flex items-center gap-1.5 text-sm font-medium">
                          <Icon name={labels.icon} size={16} />
                          {labels.method}
                        </span>
                        <span className="text-on-surface-variant mt-0.5 block text-xs">
                          {option === FulfilmentMethod.PICKUP
                            ? "Free — collect from the shop"
                            : "Sent to your address"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {state.errors?.fulfilment && (
                <p role="alert" className="text-error text-xs">
                  {state.errors.fulfilment}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          // No counter to collect from. The field is still submitted so the
          // action reads a method explicitly rather than inferring one.
          <input type="hidden" name="fulfilment" value={FulfilmentMethod.DELIVERY} />
        )}

        {collecting ? (
          <Card variant="outlined">
            <CardContent className="space-y-5">
              <h2 className="text-on-surface text-sm font-medium">Collect from</h2>

              <div className="bg-surface-container flex items-start gap-3 rounded-lg p-4">
                <Icon
                  name="storefront"
                  size={20}
                  className="text-primary mt-0.5 shrink-0"
                />
                <div className="min-w-0 text-sm">
                  {/* `whitespace-pre-line`, because the address was typed as
                      lines and reads as lines. */}
                  <p className="text-on-surface whitespace-pre-line">
                    {pickup.address}
                  </p>
                  {pickup.hours && (
                    <p className="text-on-surface-variant mt-2 flex items-center gap-1.5 text-xs">
                      <Icon name="schedule" size={14} />
                      {pickup.hours}
                    </p>
                  )}
                  {pickup.note && (
                    <p className="text-on-surface-variant mt-2 text-xs">
                      {pickup.note}
                    </p>
                  )}
                </div>
              </div>

              <TextField
                label="Full name"
                name="pickupName"
                defaultValue={values.name}
                error={state.errors?.name}
                autoComplete="name"
                maxLength={80}
                supportingText="Who is collecting — this is the name we will ask for."
                required
              />

              <TextField
                label="Phone"
                name="pickupPhone"
                type="tel"
                defaultValue={values.phone}
                error={state.errors?.phone}
                autoComplete="tel"
                maxLength={32}
                supportingText="Optional — so we can tell you when it is ready"
              />
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined">
            <CardContent className="space-y-5">
              <h2 className="text-on-surface text-sm font-medium">Delivery address</h2>

              <TextField
                label="Full name"
                name="shippingName"
                defaultValue={values.name}
                error={state.errors?.name}
                autoComplete="name"
                maxLength={80}
                required
              />

              <TextField
                label="Address"
                name="shippingLine1"
                defaultValue={values.line1}
                error={state.errors?.line1}
                autoComplete="address-line1"
                maxLength={120}
                required
              />

              <TextField
                label="Apartment, suite, etc."
                name="shippingLine2"
                defaultValue={values.line2}
                error={state.errors?.line2}
                autoComplete="address-line2"
                maxLength={120}
                supportingText="Optional"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="City"
                  name="shippingCity"
                  defaultValue={values.city}
                  error={state.errors?.city}
                  autoComplete="address-level2"
                  maxLength={60}
                  required
                />
                <TextField
                  label="State or region"
                  name="shippingRegion"
                  defaultValue={values.region}
                  error={state.errors?.region}
                  autoComplete="address-level1"
                  maxLength={60}
                  supportingText="Optional"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Postcode"
                  name="shippingPostcode"
                  defaultValue={values.postcode}
                  error={state.errors?.postcode}
                  autoComplete="postal-code"
                  maxLength={16}
                  required
                />
                <TextField
                  label="Country"
                  name="shippingCountry"
                  defaultValue={values.country}
                  error={state.errors?.country}
                  autoComplete="country-name"
                  maxLength={56}
                  required
                />
              </div>

              <TextField
                label="Phone"
                name="shippingPhone"
                type="tel"
                defaultValue={values.phone}
                error={state.errors?.phone}
                autoComplete="tel"
                maxLength={32}
                supportingText="Optional — for delivery updates only"
              />
            </CardContent>
          </Card>
        )}

        <Card variant="outlined">
          <CardContent className="space-y-4">
            <h2 className="text-on-surface text-sm font-medium">Payment</h2>

            <fieldset className="space-y-3">
              <legend className="sr-only">How to pay</legend>

              {payments.map((option) => {
                const selected = payment === option.method;
                const disabled = option.unavailable !== null;

                return (
                  <label
                    key={option.method}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                      disabled
                        ? "border-outline-variant cursor-not-allowed opacity-60"
                        : selected
                          ? "border-primary bg-primary-container/40 cursor-pointer"
                          : "border-outline-variant hover:bg-on-surface/[0.04] cursor-pointer",
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={option.method}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => setPayment(option.method)}
                      className="accent-primary mt-0.5 size-4"
                    />
                    <span className="min-w-0">
                      <span className="text-on-surface flex items-center gap-2 text-sm font-medium">
                        <PaymentMark method={option.method} />
                        {/* Cash on *collection* on a pickup order — the label
                            follows the fulfilment choice above. */}
                        {option.method === PaymentMethod.COD && collecting
                          ? "Cash on collection"
                          : option.label}
                      </span>
                      <span className="text-on-surface-variant mt-0.5 block text-xs">
                        {/* Says why it cannot be used rather than just
                            greying out — a disabled control with no reason is
                            a dead end. */}
                        {option.unavailable ??
                          (option.method === PaymentMethod.COD && collecting
                            ? "Pay when you collect your order"
                            : option.blurb)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {/* Shown here as well as on the payment page, because Khalti is
                started server-side and redirects immediately — there is no
                later screen on which to warn a Khalti payer. */}
            {sandbox && payingNow && <SandboxNotice method={payment} />}

            {state.errors?.paymentMethod && (
              <p role="alert" className="text-error text-xs">
                {state.errors.paymentMethod}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside>
        <Card variant="filled" className="sticky top-24">
          <CardContent className="space-y-4">
            <CheckoutSummary
              {...summary}
              method={collecting ? FulfilmentMethod.PICKUP : FulfilmentMethod.DELIVERY}
            />

            <Button
              type="submit"
              icon="lock"
              fullWidth
              loading={pending}
              className="h-11"
            >
              {pending
                ? payingNow
                  ? "Taking you to pay…"
                  : "Placing order…"
                : payingNow
                  ? `Pay with ${PAYMENT_METHODS[payment].label}`
                  : "Place order"}
            </Button>

            {/* Says what pressing it does. A wallet order leaves the site, and
                being told so beforehand is the difference between a redirect
                and a surprise. */}
            <p className="text-on-surface-variant text-xs">
              {payingNow
                ? `You will be taken to ${PAYMENT_METHODS[payment].label} to pay. Your order is saved first, and is not confirmed until the payment succeeds.`
                : "No payment is taken now — you pay when the order reaches you."}
            </p>

            <Link
              href="/cart"
              className="text-on-surface-variant hover:text-on-surface block rounded-sm text-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Back to cart
            </Link>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
