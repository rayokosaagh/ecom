"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { saveAddress, type AddressFormState } from "@/lib/actions/addresses";
import { LIMITS } from "@/lib/checkout/validation";
import type { SavedAddress } from "@/lib/addresses/service";

const INITIAL: AddressFormState = {};

/**
 * Add or edit one saved address.
 *
 * The same eight fields checkout asks for, under an `address` prefix rather
 * than `shipping` — both go through `parseAddressFields`, so an address saved
 * here is by construction one checkout will accept.
 *
 * `autoComplete` is set on every field, which is what makes the browser's own
 * address autofill work here: this form is where somebody types their address
 * once, and the browser filling it is strictly better than them typing it.
 */
export function AddressForm({
  address,
  /** True when this is the account's first address — see `saveAddress`. */
  isFirst,
}: {
  address: SavedAddress | null;
  isFirst: boolean;
}) {
  // `bind`, so the id travels with the action rather than through a hidden
  // input the browser would let anyone edit.
  const [state, formAction, pending] = useActionState(
    saveAddress.bind(null, address?.id ?? null),
    INITIAL,
  );

  return (
    <Card variant="outlined">
      <CardContent>
        <form action={formAction} className="space-y-5" noValidate>
          {state.message && (
            <p
              role="alert"
              className="bg-error-container text-on-error-container flex items-start gap-2 rounded-md px-4 py-3 text-sm"
            >
              <Icon name="error" size={18} className="mt-px" />
              <span>{state.message}</span>
            </p>
          )}

          <TextField
            label="Label"
            name="addressLabel"
            defaultValue={address?.label ?? ""}
            leadingIcon="bookmark"
            maxLength={40}
            error={state.errors?.label}
            supportingText="Optional — “Home”, “Office”"
          />

          <TextField
            label="Full name"
            name="addressName"
            defaultValue={address?.name ?? ""}
            autoComplete="name"
            maxLength={LIMITS.name}
            error={state.errors?.name}
            required
          />

          <TextField
            label="Address"
            name="addressLine1"
            defaultValue={address?.line1 ?? ""}
            autoComplete="address-line1"
            maxLength={LIMITS.line1}
            error={state.errors?.line1}
            required
          />

          <TextField
            label="Apartment, suite, etc."
            name="addressLine2"
            defaultValue={address?.line2 ?? ""}
            autoComplete="address-line2"
            maxLength={LIMITS.line2}
            error={state.errors?.line2}
            supportingText="Optional"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="City"
              name="addressCity"
              defaultValue={address?.city ?? ""}
              autoComplete="address-level2"
              maxLength={LIMITS.city}
              error={state.errors?.city}
              required
            />
            <TextField
              label="State or region"
              name="addressRegion"
              defaultValue={address?.region ?? ""}
              autoComplete="address-level1"
              maxLength={LIMITS.region}
              error={state.errors?.region}
              supportingText="Optional"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Postcode"
              name="addressPostcode"
              defaultValue={address?.postcode ?? ""}
              autoComplete="postal-code"
              maxLength={LIMITS.postcode}
              error={state.errors?.postcode}
              required
            />
            <TextField
              label="Country"
              name="addressCountry"
              defaultValue={address?.country ?? ""}
              autoComplete="country-name"
              maxLength={LIMITS.country}
              error={state.errors?.country}
              required
            />
          </div>

          <TextField
            label="Phone"
            name="addressPhone"
            type="tel"
            defaultValue={address?.phone ?? ""}
            autoComplete="tel"
            maxLength={LIMITS.phone}
            error={state.errors?.phone}
            supportingText="Optional — for delivery updates only"
          />

          {/* The first address is the default whatever the box says, so the
              box would be a control with no effect. Said plainly instead. */}
          {isFirst ? (
            <p className="text-on-surface-variant flex items-center gap-2 text-xs">
              <Icon name="star" size={16} />
              Your first address, so it will be used as the default at checkout.
            </p>
          ) : (
            <label className="text-on-surface flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={address?.isDefault ?? false}
                className="accent-primary size-4"
              />
              Use this address by default at checkout
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending} icon="save">
              {pending ? "Saving…" : address ? "Save address" : "Add address"}
            </Button>
            <Link
              href="/profile#addresses"
              className="text-on-surface-variant hover:text-on-surface rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
