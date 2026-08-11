import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import type { AnnouncementLevel } from "@/generated/prisma/enums";

/**
 * Reads for the announcement strip and the screen that manages it.
 *
 * Two functions rather than one with a flag, for the same reason
 * `lib/stores/service` splits them: the storefront must never accidentally
 * receive an unpublished row, and a boolean argument is one typo away from
 * exactly that.
 */

/** Invalidation handle for the storefront read. See `lib/actions/announcements`. */
export const ANNOUNCEMENTS_TAG = "announcements";

const ANNOUNCEMENT_SELECT = {
  id: true,
  message: true,
  level: true,
  href: true,
  published: true,
} as const;

export type AnnouncementView = {
  id: string;
  message: string;
  level: AnnouncementLevel;
  href: string | null;
  published: boolean;
};

/**
 * The published notices, in display order.
 *
 * This one is read on **every page of the site** — the strip rides in the
 * navigation bar — which makes it the single most-executed query the storefront
 * would own if it were not cached. So it is cached the same way the stores list
 * is, and for the same reasons: identical for every visitor, nothing per-person
 * in it to leak into a shared entry, and changed only when an admin says so.
 *
 * `cache` (React's, per request) sits on top of `unstable_cache` (across
 * requests) so a page that renders the navigation bar twice — the real one and
 * a skeleton behind a `loading.tsx` — does not repeat even the cache lookup.
 *
 * No `revalidate` window, deliberately. The schema note on `Announcement`
 * explains the other half of that decision: nothing about a notice becomes true
 * on a timer, so there is no clock for the cache to be wrong about.
 */
export const getPublishedAnnouncements = cache(
  unstable_cache(
    async (): Promise<AnnouncementView[]> =>
      prisma.announcement.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: ANNOUNCEMENT_SELECT,
      }),
    ["announcements", "published"],
    { tags: [ANNOUNCEMENTS_TAG] },
  ),
);

/**
 * Every notice, hidden ones included, for the admin screen.
 *
 * Uncached on purpose — read by the person who just changed it, and a list that
 * lags its own edit is worse than a query. The storefront is where the traffic
 * is, and that is the read worth caching.
 */
export async function getAnnouncementsForAdmin(): Promise<AnnouncementView[]> {
  return prisma.announcement.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: ANNOUNCEMENT_SELECT,
  });
}

export async function getAnnouncement(id: string): Promise<AnnouncementView | null> {
  if (!id) return null;
  return prisma.announcement.findUnique({ where: { id }, select: ANNOUNCEMENT_SELECT });
}
