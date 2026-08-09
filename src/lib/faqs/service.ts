import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reads for the FAQ section and the screen that manages it.
 *
 * Two functions rather than one with a flag, for the same reason
 * `lib/featured/service` splits them: the storefront must never accidentally
 * receive an unpublished row, and a boolean argument is one typo away from
 * exactly that.
 */

const FAQ_SELECT = {
  id: true,
  question: true,
  answer: true,
  published: true,
  sortOrder: true,
} as const;

/**
 * What the storefront shows, in display order.
 *
 * @param limit Caps the result — the home page takes the first few, `/faq`
 *   takes everything. Ordering is what decides which few, so the questions
 *   worth answering before a purchase belong at the top of the admin list.
 */
export async function getPublishedFaqs(limit?: number) {
  return prisma.faq.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    ...(limit === undefined ? {} : { take: limit }),
    select: FAQ_SELECT,
  });
}

/**
 * Every entry, drafts included, for the admin screen.
 *
 * Unpublished rows are kept precisely because they are hidden on the
 * storefront: someone reworking an answer needs to see it, and the list marks
 * it rather than pretending it is live.
 */
export async function getFaqsForAdmin() {
  return prisma.faq.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: FAQ_SELECT,
  });
}

/**
 * How many questions the storefront would show.
 *
 * For callers that only need to know whether `/faq` has anything on it — the
 * footer's invitation, which should not advertise an empty page. A count so it
 * does not read rows it will never render.
 */
export async function countPublishedFaqs(): Promise<number> {
  return prisma.faq.count({ where: { published: true } });
}

export async function getFaq(id: string) {
  if (!id) return null;
  return prisma.faq.findUnique({ where: { id }, select: FAQ_SELECT });
}
