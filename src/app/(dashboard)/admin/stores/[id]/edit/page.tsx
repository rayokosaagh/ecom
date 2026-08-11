import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreForm } from "@/components/stores/StoreForm";
import { updateStoreLocation } from "@/lib/actions/stores";
import { requireAdmin } from "@/lib/auth/dal";
import { getStoreLocation } from "@/lib/stores/service";

export const metadata: Metadata = { title: "Edit store" };

export default async function EditStorePage({
  params,
}: {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const store = await getStoreLocation(id);
  if (!store) notFound();

  // Bound here rather than inside the form, so the form stays identical
  // whether it is creating or editing.
  const action = updateStoreLocation.bind(null, store.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Edit store</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Changes appear on the Stores page as soon as they are saved.
        </p>
      </div>

      <StoreForm
        action={action}
        submitLabel="Save changes"
        values={{
          name: store.name,
          address: store.address,
          description: store.description ?? "",
          phone: store.phone ?? "",
          hours: store.hours ?? "",
          // Back to the string the field holds. `String(0)` is "0" and a null
          // stays empty, so a branch pinned on the equator keeps its pin.
          latitude: store.latitude === null ? "" : String(store.latitude),
          longitude: store.longitude === null ? "" : String(store.longitude),
          published: store.published,
        }}
      />
    </div>
  );
}
