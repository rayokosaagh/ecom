import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { PanelEmpty, ProfilePanel } from "@/components/users/ProfilePanel";
import { setDefaultAddress, deleteAddress } from "@/lib/actions/addresses";
import { MAX_ADDRESSES, summarise, type SavedAddress } from "@/lib/addresses/service";

/**
 * The saved addresses, listed.
 *
 * A Server Component, including its buttons. "Make default" and "Delete" are
 * plain forms posting to server actions, so the whole list works with no client
 * JavaScript at all — the same reasoning behind the pagination control being
 * links rather than a client-side pager. Only the add/edit *form* is a Client
 * Component, and it lives on its own route.
 *
 * Delete carries no confirmation dialog, which would need JavaScript to be one.
 * An address is re-typeable in a minute and orders keep their own copy, so the
 * cost of a misclick is low — and a `confirm()` that only appears once React
 * has loaded is worse than none, because it is a guard that is sometimes there.
 */
export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <ProfilePanel
      id="addresses"
      title="Addresses"
      blurb={
        addresses.length === 0
          ? "Save one and checkout will fill itself in."
          : full
            ? `${MAX_ADDRESSES} saved — the maximum.`
            : "The default is filled in at checkout."
      }
      // The panel's action slot, rather than a second header row of its own.
      action={
        full ? undefined : { href: "/profile/addresses/new", label: "Add", icon: "add" }
      }
    >
      <div>
        {addresses.length === 0 ? (
          <PanelEmpty icon="home_pin" message="No saved addresses yet" />
        ) : (
          <ul className="space-y-3">
            {addresses.map((address) => (
              <li
                key={address.id}
                className="border-outline-variant rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-on-surface flex flex-wrap items-center gap-2 text-sm font-medium">
                      {address.label || address.name}
                      {address.isDefault && (
                        <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5 text-label-sm font-medium">
                          Default
                        </span>
                      )}
                    </p>
                    {address.label && (
                      <p className="text-on-surface-variant mt-0.5 text-xs">
                        {address.name}
                      </p>
                    )}
                    <p className="text-on-surface-variant mt-1 text-xs">
                      {summarise(address)}
                    </p>
                    {address.phone && (
                      <p className="text-on-surface-variant mt-0.5 text-xs">
                        {address.phone}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <Link
                      href={`/profile/addresses/${address.id}/edit`}
                      aria-label={`Edit ${address.label || address.name}`}
                      className="text-on-surface-variant state-layer grid size-9 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>

                    {!address.isDefault && (
                      <form action={setDefaultAddress}>
                        <input type="hidden" name="id" value={address.id} />
                        <button
                          type="submit"
                          aria-label={`Make ${address.label || address.name} the default`}
                          title="Make default"
                          className="text-on-surface-variant state-layer grid size-9 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <Icon name="star" size={18} />
                        </button>
                      </form>
                    )}

                    <form action={deleteAddress}>
                      <input type="hidden" name="id" value={address.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${address.label || address.name}`}
                        title="Delete"
                        className="text-error state-layer grid size-9 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProfilePanel>
  );
}
