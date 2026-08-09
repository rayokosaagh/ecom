import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeCode } from "@/lib/discounts/keys";
import { judge, type DiscountVerdict } from "@/lib/discounts/rules";

export { normalizeCode };
export type { DiscountVerdict };

/**
 * The client, or a transaction on it.
 *
 * Derived from `prisma` rather than written as `Prisma.TransactionClient`:
 * this project's client is `$extends`-ed for connection retries, and an
 * extended client's transaction handle is a different type from the generated
 * one. Subtracting the methods a transaction does not have is what makes both
 * assignable here.
 */
type Db = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Deciding what a code is worth.
 *
 * Every rule is checked in one place, and that place is called twice: once
 * when the shopper applies the code, so the cart can say why it did or did not
 * work, and again inside the checkout transaction. Both are necessary. A code
 * can expire, be switched off, or be used up by somebody else in the minutes
 * between filling a cart and paying for it, and the second check is the only
 * one that decides what is actually charged.
 */

/**
 * Look a code up and judge it.
 *
 * `userId` is optional because a guest can hold a code in their cart; the
 * once-per-customer rule can only bite once there is an account to attribute
 * past orders to, and it is re-checked at checkout when there always is one.
 */
export async function evaluateDiscount(
  rawCode: string,
  subtotalCents: number,
  userId?: string,
  client: Db = prisma,
): Promise<DiscountVerdict> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, code, reason: "Enter a code." };

  const row = await client.discountCode.findUnique({ where: { code } });
  // Deliberately the same message as a code that exists but is switched off:
  // telling someone which codes are real invites guessing at the rest.
  if (!row) return { ok: false, code, reason: "That code is no longer available." };

  const usedByCustomer =
    row.oncePerCustomer && userId
      ? await client.order.count({
          where: {
            userId,
            discountCodeId: row.id,
            // A cancelled order gives the code back. Charging someone a
            // one-use code for an order that never happened is a bug the
            // customer would have to write in about.
            status: { not: "CANCELLED" },
          },
        })
      : 0;

  return judge(row, subtotalCents, usedByCustomer, new Date());
}

/** Every code, for the admin screen. */
export async function getDiscountCodes() {
  return prisma.discountCode.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { orders: true } } },
  });
}

export async function getDiscountCode(id: string) {
  return prisma.discountCode.findUnique({ where: { id } });
}
