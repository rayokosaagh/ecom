import "server-only";

import { prisma } from "@/lib/prisma";

/** Exactly the props PromoCard takes — nothing product-specific. */
export interface PromoCardData {
  imageUrl: string;
  heading: string;
  subtext: string | null;
  ctaLabel: string;
  ctaLink: string;
}

/** A card plus its identity, for callers that need a React key. */
export interface IdentifiedBanner extends PromoCardData {
  id: string;
}

export interface AdminBanner extends PromoCardData {
  id: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Which category's section it sits under; null groups it at the end. */
  categoryId: string | null;
  category: { name: string } | null;
}

/** A category heading and the banners that belong under it. */
export interface BannerGroup {
  /** Null for banners with no category — rendered without a heading. */
  category: {
    name: string;
    slug: string;
    tagline: string | null;
    taglineAccent: string | null;
  } | null;
  banners: IdentifiedBanner[];
}

const CARD_SELECT = {
  imageUrl: true,
  heading: true,
  subtext: true,
  ctaLabel: true,
  ctaLink: true,
} as const;

/**
 * Banners the storefront should show right now.
 *
 * Read on every request rather than cached, so an admin edit is live
 * immediately and a scheduled banner switches on by itself when its window
 * opens — no revalidation and no redeploy involved in either case.
 *
 * A null date bound means "unbounded in that direction", so a banner with
 * neither is simply always on.
 */
export async function getActiveBanners(): Promise<IdentifiedBanner[]> {
  const now = new Date();

  return prisma.promoBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    // createdAt breaks ties so equal sortOrder values stay in a stable order.
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { ...CARD_SELECT, id: true },
  });
}

/**
 * Active banners grouped into the sections the storefront renders, each led by
 * its category's headline.
 *
 * Section order follows the banners themselves: a group sits where its
 * earliest banner sits, so the admin's drag-and-drop still decides what comes
 * first without needing a second ordering concept. Uncategorised banners fall
 * to the end, headingless.
 */
export async function getActiveBannerGroups(): Promise<BannerGroup[]> {
  const now = new Date();

  const banners = await prisma.promoBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      ...CARD_SELECT,
      id: true,
      categoryId: true,
      category: {
        select: { name: true, slug: true, tagline: true, taglineAccent: true },
      },
    },
  });

  const groups: BannerGroup[] = [];
  const byCategory = new Map<string, BannerGroup>();

  for (const { categoryId, category, ...card } of banners) {
    // Insertion order is already the banner order, so pushing a group the
    // first time its category appears puts sections in the right sequence.
    const key = categoryId ?? "";
    let group = byCategory.get(key);
    if (!group) {
      group = { category: categoryId && category ? category : null, banners: [] };
      byCategory.set(key, group);
      groups.push(group);
    }
    group.banners.push(card);
  }

  // Headingless banners read as leftovers, so they belong last.
  return groups.sort((a, b) => Number(!a.category) - Number(!b.category));
}

/** Every banner, in display order — the admin list shows inactive ones too. */
export async function getAllBanners(): Promise<AdminBanner[]> {
  return prisma.promoBanner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      ...CARD_SELECT,
      id: true,
      sortOrder: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
}

export async function getBannerById(id: string): Promise<AdminBanner | null> {
  return prisma.promoBanner.findUnique({
    where: { id },
    select: {
      ...CARD_SELECT,
      id: true,
      sortOrder: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
}
