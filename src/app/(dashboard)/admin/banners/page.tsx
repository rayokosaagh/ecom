import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { BannerList, type BannerRow } from "@/components/banners/BannerList";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllBanners } from "@/lib/banners/service";
import { formatSchedule, hiddenReason } from "@/lib/banners/format";

export const metadata: Metadata = { title: "Promo banners" };

export default async function AdminBannersPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const banners = await getAllBanners();
  const now = new Date();

  // Dates are formatted here rather than in the client list: a browser in
  // another timezone would otherwise render different text than the server did.
  const rows: BannerRow[] = banners.map((banner) => ({
    id: banner.id,
    imageUrl: banner.imageUrl,
    heading: banner.heading,
    ctaLabel: banner.ctaLabel,
    ctaLink: banner.ctaLink,
    isActive: banner.isActive,
    group: banner.category?.name ?? null,
    schedule: formatSchedule(banner.startsAt, banner.endsAt),
    hiddenReason: hiddenReason(banner.isActive, banner.startsAt, banner.endsAt, now),
  }));

  const liveCount = rows.filter((row) => !row.hiddenReason).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Promo banners</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Promotional tiles shown on the storefront."
              : `${liveCount} of ${rows.length} showing on the storefront right now.`}
          </p>
        </div>

        <Link
          href="/admin/banners/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add banner
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="campaign" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No banners yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Add one to promote a category, a sale or anything else. Banners
              appear on the storefront as soon as they are active.
            </p>
          </CardContent>
        </Card>
      ) : (
        <BannerList banners={rows} />
      )}
    </div>
  );
}
