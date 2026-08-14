"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth/dal";
import { notifyAdmins, notifyUser } from "@/lib/notifications/service";
import { hasAnyOrder, hasPurchased } from "@/lib/reviews/service";
import { isReportReason, statusForNewReview } from "@/lib/reviews/policy";
import { parseReply, parseReview } from "@/lib/reviews/validation";
import {
  NotificationType,
  ReviewReportReason,
  ReviewStatus,
  Role,
} from "@/generated/prisma/enums";

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

  /**
   * Where this piece of writing starts its life — see `lib/reviews/policy`.
   *
   * Recomputed on an edit as well as a first submission, and that is the point:
   * an edited review goes back through whatever gate a new one would face,
   * rather than inheriting the decision made about words that have since been
   * replaced. Hiding one and having it silently republish itself on the next
   * keystroke was the hole this closes.
   */
  const status = statusForNewReview(verified);

  await prisma.review.upsert({
    where: { userId_productId: { userId: user.id, productId: product.id } },
    update: {
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      verified,
      status,
      // Back to unmoderated: whatever an admin decided was about the old text.
      moderatedAt: null,
      moderatedById: null,
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
      status,
      media: { create: attachments },
    },
  });

  const awaiting = status === ReviewStatus.PENDING;

  // Only on the first one — an admin does not need telling every time someone
  // fixes a typo. One exception: a review that has landed in the queue is a
  // task rather than news, so an edit that puts it back there is worth saying.
  if (!existing || awaiting) {
    await notifyAdmins({
      type: NotificationType.SYSTEM,
      title: awaiting ? "Review awaiting approval" : "New review",
      description: `${user.name ?? user.email} rated ${product.name} ${parsed.data.rating}/5`,
      href: awaiting ? "/admin/reviews?status=pending" : "/admin/reviews",
      imageUrl: product.image,
    });
  }

  revalidateProductViews(product.slug);

  // The author is told what happened to it, rather than being left to work out
  // why their words are not on the page. Saying nothing is how a moderation
  // queue reads as a bug.
  if (awaiting) {
    return {
      success: existing
        ? "Your review has been updated and is waiting to be approved."
        : "Thanks — your review is waiting to be approved.",
    };
  }

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
 * Publish or hide a review.
 *
 * Hiding, never deleting: the author's slot stays taken, so a hidden review
 * cannot simply be re-posted word for word as a "new" one. It also leaves
 * something to look at if the decision is questioned later.
 *
 * Every path through here stamps who decided and when. That stamp is what the
 * queue reads as "somebody has looked at this" — `status` cannot say it, since
 * a review that published itself and one an admin approved wear the same value.
 */
export async function setReviewStatus(
  reviewId: string,
  status: ReviewStatus,
): Promise<ReviewActionState> {
  const admin = await requireAdmin();

  // A server action is a public endpoint, so the parameter's type is a claim
  // the caller makes rather than one the boundary enforces — the same reason
  // `updateOrderStatus` checks the status it is handed. Without this, anything
  // outside the enum reaches Prisma and surfaces as a 500.
  //
  // PENDING is refused deliberately even though it is a legal value of the
  // enum: it is where the *policy* puts a review, not somewhere a moderator
  // sends one. "Undo" here is Publish or Hide, both of which are decisions.
  if (status !== ReviewStatus.PUBLISHED && status !== ReviewStatus.HIDDEN) {
    return { message: "That is not a valid review status." };
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      userId: true,
      product: { select: { name: true, slug: true, image: true } },
    },
  });
  if (!review) return { message: "That review no longer exists." };

  await prisma.review.update({
    where: { id: reviewId },
    data: {
      status,
      moderatedAt: new Date(),
      moderatedById: admin.id,
      // Hiding *is* the answer to a complaint, so the open reports go with it.
      // Leaving them open would put the review back in the Reported queue for
      // the next moderator to decide all over again.
      ...(status === ReviewStatus.HIDDEN
        ? { reports: { updateMany: { where: { resolvedAt: null }, data: { resolvedAt: new Date() } } } }
        : {}),
    },
  });

  // The author hears about approvals and removals, because both are things
  // that happened to their writing while they were not looking. Republishing
  // something that was already published is not news, so nothing is sent.
  if (status === ReviewStatus.PUBLISHED && review.status === ReviewStatus.PENDING) {
    await notifyUser(review.userId, {
      type: NotificationType.SYSTEM,
      title: "Your review is live",
      description: `Your review of ${review.product.name} has been published.`,
      href: `/products/${review.product.slug}#reviews-heading`,
      imageUrl: review.product.image,
    });
  } else if (status === ReviewStatus.HIDDEN && review.status !== ReviewStatus.HIDDEN) {
    await notifyUser(review.userId, {
      type: NotificationType.SYSTEM,
      title: "Your review was hidden",
      description: `A moderator has taken your review of ${review.product.name} off the product page.`,
      href: `/products/${review.product.slug}#reviews-heading`,
      imageUrl: review.product.image,
    });
  }

  revalidateProductViews(review.product.slug);

  return {
    success:
      status === ReviewStatus.HIDDEN
        ? "Review hidden."
        : review.status === ReviewStatus.PENDING
          ? "Review approved and published."
          : "Review published again.",
  };
}

/**
 * Settle the reports on a review without touching the review itself.
 *
 * The other half of the Reported tab: a flag is a question, and "there is
 * nothing wrong with this" is a legitimate answer to it. Without this the only
 * way to clear the queue would be to hide things, which is a moderation tool
 * that only points one way.
 *
 * Resolved rather than deleted, so a review flagged again next month reads as a
 * pattern rather than as a first offence.
 */
export async function dismissReviewReports(
  reviewId: string,
): Promise<ReviewActionState> {
  const admin = await requireAdmin();

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { product: { select: { slug: true } }, _count: { select: { reports: true } } },
  });
  if (!review) return { message: "That review no longer exists." };

  const settled = await prisma.reviewReport.updateMany({
    where: { reviewId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  if (settled.count === 0) return { message: "There is nothing open to dismiss." };

  await prisma.review.update({
    where: { id: reviewId },
    data: { moderatedAt: new Date(), moderatedById: admin.id },
  });

  revalidateProductViews(review.product.slug);

  return {
    success: `${settled.count} report${settled.count === 1 ? "" : "s"} dismissed.`,
  };
}

/**
 * Flag a review, as a shopper.
 *
 * Signed-in only, one per person per review, and never your own — the three
 * rules that keep the count on a flag meaning "this many different people
 * objected" rather than "somebody held the button down".
 *
 * The unique constraint does the deciding rather than a read followed by a
 * write that races it, which is the same shape `toggleReviewLike` uses.
 */
export async function reportReview(
  reviewId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const user = await requireUser();

  const reason = String(formData.get("reason") ?? "");
  if (!isReportReason(reason)) {
    return { errors: { reason: "Pick a reason." } };
  }

  const note = String(formData.get("note") ?? "").trim();
  if (reason === "OTHER" && note.length === 0) {
    return { errors: { note: "Tell us what is wrong with it." } };
  }
  if (note.length > 300) {
    return { errors: { note: "Keep this under 300 characters." } };
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      userId: true,
      status: true,
      product: { select: { name: true, slug: true, image: true } },
    },
  });
  if (!review) return { message: "That review no longer exists." };
  if (review.userId === user.id) {
    return { message: "You cannot report your own review." };
  }
  // Nothing on display, nothing to complain about — and a queue full of flags
  // against reviews nobody can see is a queue that wastes a moderator's day.
  if (review.status !== ReviewStatus.PUBLISHED) {
    return { message: "That review is not on the product page." };
  }

  const existing = await prisma.reviewReport.findUnique({
    where: { reviewId_userId: { reviewId, userId: user.id } },
    select: { resolvedAt: true },
  });

  if (existing && !existing.resolvedAt) {
    return { success: "You have already reported this review." };
  }

  await prisma.reviewReport.upsert({
    where: { reviewId_userId: { reviewId, userId: user.id } },
    // Reopening: a report settled last month should not stop the same person
    // objecting to the same words again, and a second row is not allowed.
    update: {
      reason: reason as ReviewReportReason,
      note: note || null,
      resolvedAt: null,
      createdAt: new Date(),
    },
    create: {
      reviewId,
      userId: user.id,
      reason: reason as ReviewReportReason,
      note: note || null,
    },
  });

  await notifyAdmins({
    type: NotificationType.SYSTEM,
    title: "Review reported",
    description: `${user.name ?? user.email} flagged a review of ${review.product.name}`,
    href: "/admin/reviews?status=reported",
    imageUrl: review.product.image,
  });

  revalidatePath("/admin/reviews");

  return { success: "Thanks — a moderator will take a look." };
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
