import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddressForm } from "@/components/users/AddressForm";
import { ProfileShell } from "@/components/users/ProfileShell";
import { getAddresses, MAX_ADDRESSES } from "@/lib/addresses/service";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";

export const metadata: Metadata = { title: "Add address" };

export default async function NewAddressPage() {
  const user = await requireUser();
  const [addresses, nav] = await Promise.all([getAddresses(user.id), getNavData()]);

  // The action refuses this too — this is the courtesy that stops somebody
  // filling in eight fields before being told.
  if (addresses.length >= MAX_ADDRESSES) redirect("/profile#addresses");

  return (
    <ProfileShell
      nav={nav}
      width="max-w-2xl"
      back={{ href: "/profile#addresses", label: "Back to profile" }}
    >
      <div>
        <h1 className="text-on-surface text-2xl font-normal tracking-tight">
          Add an address
        </h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Saved addresses fill themselves in at checkout.
        </p>
      </div>

      <AddressForm address={null} isFirst={addresses.length === 0} />
    </ProfileShell>
  );
}
