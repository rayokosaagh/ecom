import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

/**
 * Reads for the Stores page and the screen that manages it.
 *
 * Two functions rather than one with a flag, for the same reason
 * `lib/social/service` splits them: the storefront must never accidentally
 * receive an unpublished row, and a boolean argument is one typo away from
 * exactly that.
 */

/** Invalidation handle for the storefront read. See `lib/actions/stores`. */
export const STORE_LOCATIONS_TAG = "store-locations";

const STORE_SELECT = {
  id: true,
  name: true,
  address: true,
  description: true,
  phone: true,
  hours: true,
  latitude: true,
  longitude: true,
  published: true,
} as const;

export type StoreLocationView = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  phone: string | null;
  hours: string | null;
  latitude: number | null;
  longitude: number | null;
  published: boolean;
};

/**
 * The published branches, in display order.
 *
 * Two caches, doing two different jobs:
 *
 * `unstable_cache` holds the rows **across requests**, so the Stores page costs
 * one query per *edit* rather than one per visitor. That is the right trade
 * here and nowhere near universally right — this list changes when an admin
 * opens a branch, which is a handful of times a year, and it is identical for
 * every visitor. Nothing about it is per-person, so there is nothing to leak
 * into a shared entry. Contrast the cart or the wishlist, which are cached per
 * request only, because a shared entry there would be somebody else's data.
 *
 * `cache` (React's, per request) sits on top so a page reading the list twice —
 * once for the cards, once for the JSON-LD — does not go through the cache
 * lookup twice either.
 *
 * No `revalidate` window is set, so entries live until something invalidates
 * them. A timer would mean either serving a closed branch for an hour or paying
 * for a query nobody's edit justified; the mutations already know exactly when
 * this changed, and `revalidateTag(STORE_LOCATIONS_TAG)` says so.
 */
export const getPublishedStoreLocations = cache(
  unstable_cache(
    async (): Promise<StoreLocationView[]> =>
      prisma.storeLocation.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: STORE_SELECT,
      }),
    ["store-locations", "published"],
    { tags: [STORE_LOCATIONS_TAG] },
  ),
);

/**
 * Every branch, hidden ones included, for the admin screen.
 *
 * Uncached on purpose. This one is read by the person who just changed it, and
 * a list that lags its own edit is worse than a query — the storefront is where
 * the traffic is, and that is the read worth caching.
 */
export async function getStoreLocationsForAdmin(): Promise<StoreLocationView[]> {
  return prisma.storeLocation.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: STORE_SELECT,
  });
}

export async function getStoreLocation(id: string): Promise<StoreLocationView | null> {
  if (!id) return null;
  return prisma.storeLocation.findUnique({ where: { id }, select: STORE_SELECT });
}

/**
 * What to point Google Maps at.
 *
 * Coordinates when the branch has them, because they are unambiguous; the
 * address otherwise, because a named street finds itself perfectly well and
 * demanding coordinates would have made the map an admin chore rather than a
 * default. Newlines become commas — a query is one line.
 */
export function mapQuery(store: {
  address: string;
  latitude: number | null;
  longitude: number | null;
}): string {
  if (store.latitude !== null && store.longitude !== null) {
    return `${store.latitude},${store.longitude}`;
  }
  return store.address.split("\n").map((line) => line.trim()).filter(Boolean).join(", ");
}
