import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/dal";
import { getCartCount } from "@/lib/cart/service";
import { findCartId } from "@/lib/cart/identity";
import { getNotifications, formatRelativeTime } from "@/lib/notifications/service";
import { getPublishedAnnouncements } from "@/lib/announcements/service";
import { getWishlistCounts } from "@/lib/wishlist/service";
import type { NavbarProps } from "@/components/nav/Navbar";
import type { MenuCategory } from "@/components/nav/ProductsMenu";

/**
 * Everything the Navbar needs, in one place.
 *
 * Cached per request, so a page that renders the Navbar and also reads the
 * current user does not pay for the session lookup twice.
 */
export const getNavData = cache(async (): Promise<NavbarProps> => {
  const user = await getCurrentUser();

  // Nested for the menu: children hang off their parent rather than sitting
  // beside it as a flat list. No product counts — they added noise without
  // helping anyone choose a shelf.
  //
  // The announcements ride alongside rather than after: they are the same shape
  // of question — "what does the bar show everyone" — and neither depends on
  // the other's result. On all but the first render after an edit this second
  // one is served from the cross-request cache and costs no query at all, which
  // is what makes a strip on every page affordable. See
  // `lib/announcements/service`.
  const [categories, announcements] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, parentId: true },
    }),
    getPublishedAnnouncements(),
  ]);

  const byId = new Map(
    categories.map((category) => [
      category.id,
      { name: category.name, slug: category.slug, children: [] as MenuCategory[] },
    ]),
  );

  const menuCategories: MenuCategory[] = [];
  for (const category of categories) {
    const node = byId.get(category.id)!;
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    if (parent) parent.children.push(node);
    else menuCategories.push(node);
  }

  // Signed-out visitors still have a cart — just no wishlist or notices.
  if (!user) {
    return {
      user: null,
      categories: menuCategories,
      announcements,
      notifications: [],
      cartCount: await getCartCount(await findCartId()),
      wishlistCount: 0,
      wishlistNewCount: 0,
      notificationNewCount: 0,
    };
  }

  /**
   * When each badge was last emptied.
   *
   * Read before the counts rather than beside them, because both counts are
   * "since this" — one extra primary-key lookup buys the difference between a
   * badge that reports news and one that reports a total nobody asked to be
   * reminded of.
   */
  const [cartCount, marks] = await Promise.all([
    findCartId().then(getCartCount),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { wishlistSeenAt: true, notificationsSeenAt: true },
    }),
  ]);

  const [wishlist, { items, newCount }] = await Promise.all([
    getWishlistCounts(user.id, marks?.wishlistSeenAt ?? null),
    getNotifications(user.id, marks?.notificationsSeenAt ?? null),
  ]);

  return {
    user,
    categories: menuCategories,
    announcements,
    cartCount,
    wishlistCount: wishlist.total,
    wishlistNewCount: wishlist.unseen,
    notificationNewCount: newCount,
    notifications: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      href: item.href,
      imageUrl: item.imageUrl,
      unread: !item.read,
      time: formatRelativeTime(item.createdAt),
    })),
  };
});
