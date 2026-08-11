import type { Metadata } from "next";

import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";
import { createAnnouncement } from "@/lib/actions/announcements";
import { requireAdmin } from "@/lib/auth/dal";
import { AnnouncementLevel } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">New announcement</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          It joins the end of the strip; reorder it from the Announcements
          screen.
        </p>
      </div>

      <AnnouncementForm
        action={createAnnouncement}
        submitLabel="Add announcement"
        values={{
          message: "",
          // The quietest level is the default, so escalating is something an
          // admin chooses rather than something they forget to turn down.
          level: AnnouncementLevel.INFO,
          href: "",
          published: true,
        }}
      />
    </div>
  );
}
