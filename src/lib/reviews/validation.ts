import type { Validated } from "@/lib/auth/validation";
import {
  MAX_REVIEW_MEDIA,
  isUploadedUrl,
  mediaKindFor,
} from "@/lib/uploads/config";

/**
 * Review rules, hand-rolled in the same style as the other validators here.
 *
 * The body has a floor as well as a ceiling: "good" tells the next shopper
 * nothing, and a review that says nothing is worse than no review, because it
 * still moves the average.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const BODY_MIN = 10;
export const BODY_MAX = 2_000;
export const TITLE_MAX = 80;

export type ReviewInput = {
  rating: number;
  title: string | null;
  body: string;
  media: { url: string; kind: "IMAGE" | "VIDEO" }[];
};

export function parseReview(formData: FormData): Validated<ReviewInput> {
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  const errors: Record<string, string> = {};

  /**
   * Attachments arrive as repeated `media` fields holding URLs the upload
   * action already returned.
   *
   * Every one is checked against the shape this app generates. That check is
   * the whole defence: without it a crafted submission could point an
   * attachment at any URL anywhere, and the product page would dutifully embed
   * it. Anything that fails is dropped rather than rejected — the usual cause
   * is a stale form, and losing an attachment beats losing the review.
   */
  const media: { url: string; kind: "IMAGE" | "VIDEO" }[] = [];
  const seen = new Set<string>();
  for (const entry of formData.getAll("media")) {
    const url = String(entry);
    if (seen.has(url)) continue;
    const kind = mediaKindFor(url);
    if (!isUploadedUrl(url) || !kind) continue;
    seen.add(url);
    media.push({ url, kind });
  }

  if (media.length > MAX_REVIEW_MEDIA) {
    errors.media = `Attach up to ${MAX_REVIEW_MEDIA} photos or clips`;
  }

  // `Number("")` is 0 and `Number("abc")` is NaN — both fail this, which is
  // what we want from a field that must carry a whole 1–5.
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    errors.rating = "Choose a rating from 1 to 5 stars";
  }

  if (!body) errors.body = "Tell other shoppers what you thought";
  else if (body.length < BODY_MIN) {
    errors.body = `Write at least ${BODY_MIN} characters`;
  } else if (body.length > BODY_MAX) {
    errors.body = `Keep it to ${BODY_MAX} characters or fewer`;
  }

  if (title.length > TITLE_MAX) {
    errors.title = `Headline must be ${TITLE_MAX} characters or fewer`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { rating, title: title || null, body, media } };
}

/** A reply is a sentence or two, not a second review. */
export const REPLY_MIN = 2;
export const REPLY_MAX = 600;

export type ReplyInput = { body: string };

/**
 * Rules for answering a review.
 *
 * Deliberately looser than `parseReview`'s. A review moves the average, so it
 * has a floor to keep "good" out of the arithmetic; a reply moves nothing and
 * "Yes" is a complete answer to "does it fit a 14in?". The floor here only
 * exists to reject an empty box and a stray keystroke.
 */
export function parseReply(formData: FormData): Validated<ReplyInput> {
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { ok: false, errors: { body: "Write a reply first" } };
  if (body.length < REPLY_MIN) {
    return { ok: false, errors: { body: "That is a little short" } };
  }
  if (body.length > REPLY_MAX) {
    return {
      ok: false,
      errors: { body: `Keep it to ${REPLY_MAX} characters or fewer` },
    };
  }

  return { ok: true, data: { body } };
}
