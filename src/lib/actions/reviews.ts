"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth/dal";
import { notifyAdmins, notifyUser } from "@/lib/notifications/service";
import { hasAnyOrder, hasPurchased } from "@/lib/reviews/service";
import { parseReply, parseReview } from "@/lib/reviews/validation";
import { NotificationType, ReviewStatus, Role } from "@/generated/prisma/enums";

export type ReviewActionState = {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
};

/** Revalidates every surface a rating shows on. */
function revalidateProductViews(slug: string) {
  revalidatePath(`/products/${slug}`);
  // Ratings appear on cards across the catalogue and the home page.
  revalidatePath("/products", "layout");
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  // Recently purchased shows the author their own verdict, so writing one has
  // to move that card from "Write a review" to the stars.
  revalidatePath("/profile");
}

/**
 * Write or update the signed-in user's review of a product.
 *
 * An upsert rather than an insert: the schema allows one verdict per person
 * per product, so a second submission is someone changing their mind, not a
 * second opinion. Editing keeps `createdAt` and moves `updatedAt`.
 */
export async function submitReview(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const user = await requireUser();
  const productId = String(formData.get("productId") ?? "");

  const parsed = parseReview(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    // `image` is here only for the notification below — one column on a row
    // already being read, rather than a second query when it comes time to
    // raise the notice.
    select: { id: true, name: true, slug: true, published: true, image: true },
  });
  if (!product?.published) return { message: "That product is not available." };

  // Re-checked here rather than trusted from the page that rendered the form —
  // the page decides what to draw, this decides what is allowed, and only the
  // second one holds against a hand-made request.
  if (!(await hasAnyOrder(user.id))) {
    return { message: "Only customers who have ordered from us can write reviews." };
  }

  // Recomputed on every submission rather than carried forward: someone who
  // reviews a product and then buys it should have the badge appear when they
  // next edit, and the reverse should not silently persist.
  const verified = await hasPurchased(product.id, user.id);

  const existing = await prisma.review.findUnique({
    where: { userId_productId: { userId: user.id, productId: product.id } },
    select: { id: true },
  });

  const attachments = parsed.data.media.map((item, index) => ({
    url: item.url,
    kind: item.kind,
    sortOrder: index,
  }));

  await prisma.review.upsert({
    where: { userId_productId: { userId: user.id, productId: product.id } },
    update: {
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      verified,
      // An edited review goes back on display. Otherwise hiding one would
      // silence that person on that product permanently, which is a ban, not
      // moderation of a particular piece of writing.
      status: ReviewStatus.PUBLISHED,
      // The form always submits the full set it is holding, so replacing is
      // what an edit means here. Merging would make removal impossible to
      // express.
      media: { deleteMany: {}, create: attachments },
    },
    create: {
      productId: product.id,
      userId: user.id,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      verified,
      media: { create: attachments },
    },
  });

  // Only on the first one — an admin does not need telling every time someone
  // fixes a typo.
  if (!existing) {
    await notifyAdmins({
      type: NotificationType.SYSTEM,
      title: "New review",
      description: `${user.name ?? user.email} rated ${product.name} ${parsed.data.rating}/5`,
      href: "/admin/reviews",
      imageUrl: product.image,
    });
  }

  revalidateProductViews(product.slug);

  return {
    success: existing ? "Your review has been updated." : "Thanks for your review.",
  };
}

/** Remove your own review. Scoped by `userId`, so it can only ever be yours. */
export async function deleteReview(reviewId: string): Promise<void> {
  const user = await requireUser();

  const review = await prisma.review.findFirst({
    where: { id: reviewId, userId: user.id },
    select: { product: { select: { slug: true } } },
  });
  if (!review) return;

  await prisma.review.deleteMany({ where: { id: reviewId, userId: user.id } });
  revalidateProductViews(review.product.slug);
}

/**
 * Hide or restore a review.
 *
 * Hiding, never deleting: the author's slot stays taken, so a hidden review
 * cannot simply be re-posted word for word as a "new" one. It also leaves
 * something to look at if the decision is questioned later.
 */
export async function setReviewStatus(
  reviewId: string,
  status: ReviewStatus,
): Promise<ReviewActionState> {
  await requireAdmin();

  // A server action is a public endpoint, so the parameter's type is a claim
  // the caller makes rather than one the boundary enforces — the same reason
  // `updateOrderStatus` checks the status it is handed. Without this, anything
  // outside the enum reaches Prisma and surfaces as a 500.
  if (status !== ReviewStatus.PUBLISHED && status !== ReviewStatus.HIDDEN) {
    return { message: "That is not a valid review status." };
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { product: { select: { slug: true } } },
  });
  if (!review) return { message: "That review no longer exists." };

  await prisma.review.update({ where: { id: reviewId }, data: { status } });
  revalidateProductViews(review.product.slug);

  return {
    success:
      status === ReviewStatus.HIDDEN ? "Review hidden." : "Review published again.",
  };
}

/**
 * Like a review, or take the like back.
 *
 * A toggle rather than separate like/unlike actions: the button has one
 * meaning to the person pressing it, and two endpoints would let a client that
 * disagreed with the server about the current state ask for the wrong one.
 *
 * You cannot like your own review. A like is one shopper vouching for another,
 * and a self-vouch is worth nothing — the count would quietly start at one for
 * everybody, which is the same as starting at zero except more misleading.
 */
export async function toggleReviewLike(
  reviewId: string,
): Promise<ReviewActionState> {
  const user = await requireUser();

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { userId: true, status: true, product: { select: { slug: true } } },
  });
  if (!review) return { message: "That review no longer exists." };
  if (review.userId === user.id) {
    return { message: "You cannot like your own review." };
  }
  // Nothing hidden should be collecting endorsements while it is out of sight.
  if (review.status !== ReviewStatus.PUBLISHED) {
    return { message: "That review is not available." };
  }

  // Delete-then-create-if-nothing-went, so the composite key does the deciding
  // rather than a read followed by a write that races it.
  const removed = await prisma.reviewLike.deleteMany({
    where: { reviewId, userId: user.id },
  });
  if (removed.count === 0) {
    await prisma.reviewLike.create({ data: { reviewId, userId: user.id } });
  }

  revalidateProductViews(review.product.slug);
  return {};
}

/**
 * Answer a review.
 *
 * Anyone signed in may reply, including the review's author — "update: it did
 * fit" belongs under the original, not as an edit that rewrites what people
 * already read.
 */
export async function submitReply(
  reviewId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const user = await requireUser();

  const parsed = parseReply(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      userId: true,
      status: true,
      productId: true,
      product: { select: { slug: true, name: true, image: true } },
    },
  });
  if (!review) return { message: "That review no longer exists." };
  if (review.status !== ReviewStatus.PUBLISHED) {
    return { message: "That review is not available." };
  }

  // Snapshotted now, for the same reason `Review.verified` is: a badge records
  // what was true when the words were written.
  const verified = await hasPurchased(review.productId, user.id);

  await prisma.reviewReply.create({
    data: { reviewId, userId: user.id, body: parsed.data.body, verified },
  });

  // The person being answered is told; nobody replying to themselves is.
  if (review.userId !== user.id) {
    await notifyUser(review.userId, {
      // Same bucket the "New review" notice above uses — there is no REVIEW
      // type, and inventing one is a schema change for a label nobody filters
      // on.
      type: NotificationType.SYSTEM,
      title: "Someone replied to your review",
      description: `${user.name ?? user.email} answered your review of ${review.product.name}`,
      href: `/products/${review.product.slug}#reviews-heading`,
      imageUrl: review.product.image,
    });
  }

  revalidateProductViews(review.product.slug);
  return { success: "Reply posted." };
}

/**
 * Remove a reply.
 *
 * The author may delete their own; an admin may delete any. Scoped inside the
 * query for a plain user so another person's id simply matches nothing, which
 * is the same authorization shape `deleteReview` uses.
 */
export async function deleteReply(replyId: string): Promise<void> {
  const user = await requireUser();

  const reply = await prisma.reviewReply.findUnique({
    where: { id: replyId },
    select: {
      userId: true,
      review: { select: { product: { select: { slug: true } } } },
    },
  });
  if (!reply) return;

  const mine = reply.userId === user.id;
  if (!mine && user.role !== Role.ADMIN) return;

  await prisma.reviewReply.delete({ where: { id: replyId } });
  revalidateProductViews(reply.review.product.slug);
}
