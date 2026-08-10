import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AddressForm } from "@/components/users/AddressForm";
import { ProfileShell } from "@/components/users/ProfileShell";
import { getAddress } from "@/lib/addresses/service";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";

export const metadata: Metadata = { title: "Edit address" };

export default async function EditAddressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // `getAddress` is scoped by user, so somebody else's id is a 404 here rather
  // than a page that renders their address.
  const [address, nav] = await Promise.all([getAddress(id, user.id), getNavData()]);
  if (!address) notFound();

  return (
    <ProfileShell
      nav={nav}
      width="max-w-2xl"
      back={{ href: "/profile#addresses", label: "Back to profile" }}
    >
      <div>
        <h1 className="text-on-surface text-2xl font-normal tracking-tight">
          Edit address
        </h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Changing this does not affect where past orders were sent.
        </p>
      </div>

      <AddressForm address={address} isFirst={false} />
    </ProfileShell>
  );
}
