import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  AnnouncementList,
  type AnnouncementRow,
} from "@/components/announcements/AnnouncementList";
import { requireAdmin } from "@/lib/auth/dal";
import { getAnnouncementsForAdmin } from "@/lib/announcements/service";

export const metadata: Metadata = { title: "Announcements" };

export default async function AdminAnnouncementsPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const rows: AnnouncementRow[] = await getAnnouncementsForAdmin();
  const live = rows.filter((row) => row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Announcements</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "The strip under the navigation bar, on every page."
              : `${live} of ${rows.length} running on the strip.`}
          </p>
        </div>

        <Link
          href="/admin/announcements/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add announcement
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="campaign" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">Nothing announced</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              The strip is hidden entirely while this list is empty, so the shop
              never shows an empty band of colour. Add a notice and it appears
              under the navigation bar on every page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AnnouncementList rows={rows} />
      )}
    </div>
  );
}
