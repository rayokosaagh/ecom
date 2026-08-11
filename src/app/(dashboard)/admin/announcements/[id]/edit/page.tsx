import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";
import { updateAnnouncement } from "@/lib/actions/announcements";
import { requireAdmin } from "@/lib/auth/dal";
import { getAnnouncement } from "@/lib/announcements/service";

export const metadata: Metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({
  params,
}: {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const announcement = await getAnnouncement(id);
  if (!announcement) notFound();

  // Bound here rather than inside the form, so the form stays identical
  // whether it is creating or editing.
  const action = updateAnnouncement.bind(null, announcement.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Edit announcement</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Changes reach every page as soon as they are saved.
        </p>
      </div>

      <AnnouncementForm
        action={action}
        submitLabel="Save changes"
        values={{
          message: announcement.message,
          level: announcement.level,
          href: announcement.href ?? "",
          published: announcement.published,
        }}
      />
    </div>
  );
}
