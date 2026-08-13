import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ProfileShell } from "@/components/users/ProfileShell";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";
import { hasPurchased } from "@/lib/reviews/service";

export const metadata: Metadata = { title: "Write a review" };

/**
 * Review something you bought, without leaving your account.
 *
 * Its own route holding the Client Component, the same shape as /profile/edit
 * and the address forms: the profile itself stays server-rendered and free of
 * form JavaScript, and the star picker, the media uploader and the character
 * counter are loaded only by somebody who has actually chosen to write.
 *
 * `ReviewForm` is the product page's form, reused unchanged. That matters for
 * more than line count — it means a review written here and one written on the
 * product page go through the same component to the same action, so they cannot
 * validate differently or store different things.
 */
export default async function ReviewPurchasePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const user = await requireUser();
  const { productId } = await params;

  const [product, nav] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, image: true, published: true },
    }),
    getNavData(),
  ]);

  if (!product?.published) notFound();

  /**
   * You may only review from here what you bought.
   *
   * Stricter than the product page, which lets any customer speak about
   * anything in the catalogue — see `hasAnyOrder`. This route is reached from
   * "recently purchased", so the promise it makes is narrower, and a
   * hand-typed product id should not be a way around that framing. The action
   * still applies its own rules regardless; this decides what to draw.
   */
  const [purchased, existing] = await Promise.all([
    hasPurchased(product.id, user.id),
    prisma.review.findUnique({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      select: {
        rating: true,
        title: true,
        body: true,
        media: {
          orderBy: { sortOrder: "asc" },
          select: { url: true, kind: true },
        },
      },
    }),
  ]);

  if (!purchased) notFound();

  return (
    <ProfileShell
      nav={nav}
      width="max-w-2xl"
      back={{ href: "/profile#purchases", label: "Back to profile" }}
    >
      <div>
        <h1 className="text-on-surface text-headline-sm">
          {existing ? "Edit your review" : "Write a review"}
        </h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Your review will show a verified badge, because you bought this here.
        </p>
      </div>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="bg-surface-container-highest size-14 shrink-0 overflow-hidden rounded-lg">
              {product.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={product.image} alt="" className="size-full object-cover" />
              ) : (
                <div className="text-on-surface-variant grid size-full place-items-center">
                  <Icon name="inventory_2" size={20} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-on-surface truncate text-sm font-medium">
                {product.name}
              </p>
              <Link
                href={`/products/${product.slug}`}
                className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                View product
              </Link>
            </div>
          </div>

          <ReviewForm
            productId={product.id}
            existing={
              existing
                ? {
                    rating: existing.rating,
                    title: existing.title,
                    body: existing.body,
                    media: existing.media.map((item) => ({
                      url: item.url,
                      kind: item.kind,
                    })),
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </ProfileShell>
  );
}
