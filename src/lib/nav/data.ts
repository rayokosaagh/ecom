import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/dal";
import { getCartCount } from "@/lib/cart/service";
import { findCartId } from "@/lib/cart/identity";
import { getNotifications, formatRelativeTime } from "@/lib/notifications/service";
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
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, parentId: true },
  });

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
      notifications: [],
      cartCount: await getCartCount(await findCartId()),
      wishlistCount: 0,
    };
  }

  const [cartCount, wishlistCount, { items }] = await Promise.all([
    findCartId().then(getCartCount),
    prisma.wishlistItem.count({ where: { userId: user.id } }),
    getNotifications(user.id),
  ]);

  return {
    user,
    categories: menuCategories,
    cartCount,
    wishlistCount,
    notifications: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      href: item.href,
      unread: !item.read,
      time: formatRelativeTime(item.createdAt),
    })),
  };
});
