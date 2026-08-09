import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reads for the follow bar and the screen that manages it.
 *
 * Two functions rather than one with a flag, for the same reason
 * `lib/faqs/service` splits them: the storefront must never accidentally
 * receive an unpublished row, and a boolean argument is one typo away from
 * exactly that.
 */

const SOCIAL_SELECT = {
  id: true,
  platform: true,
  url: true,
  label: true,
  hoverColor: true,
  iconSvg: true,
  published: true,
} as const;

/** What the home page shows, in display order. */
export async function getPublishedSocialLinks() {
  return prisma.socialLink.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: SOCIAL_SELECT,
  });
}

/**
 * Every link, hidden ones included, for the admin screen.
 *
 * Hidden rows are kept precisely because they are invisible on the storefront:
 * someone who has switched an account off still needs to find it again, and the
 * list marks it rather than pretending it is live.
 */
export async function getSocialLinksForAdmin() {
  return prisma.socialLink.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: SOCIAL_SELECT,
  });
}

export async function getSocialLink(id: string) {
  if (!id) return null;
  return prisma.socialLink.findUnique({ where: { id }, select: SOCIAL_SELECT });
}
