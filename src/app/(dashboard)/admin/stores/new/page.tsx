import type { Metadata } from "next";

import { StoreForm } from "@/components/stores/StoreForm";
import { createStoreLocation } from "@/lib/actions/stores";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "New store" };

export default async function NewStorePage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">New store</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          It joins the end of the list; reorder it from the Stores screen.
        </p>
      </div>

      <StoreForm
        action={createStoreLocation}
        submitLabel="Add store"
        values={{
          name: "",
          address: "",
          description: "",
          phone: "",
          // Prefilled with the shape the renderer expects, so the first branch
          // anyone adds comes out looking like the example in the hint rather
          // than teaching the convention by trial and error.
          hours: "Sun–Fri: 10:00 – 19:00\nSat: Closed",
          latitude: "",
          longitude: "",
          published: true,
        }}
      />
    </div>
  );
}
