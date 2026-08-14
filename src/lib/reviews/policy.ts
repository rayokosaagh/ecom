import { ReviewStatus } from "@/generated/prisma/enums";

/**
 * When a review needs a moderator's approval before anybody sees it.
 *
 * One function, in one file, deliberately: the rule is a *policy* — the kind of
 * thing a shop changes its mind about — and the rest of the app should be able
 * to change it without going looking for every place a review is written.
 *
 * The rule today: a review from someone who bought that exact product publishes
 * itself, and anything else waits. Writing at all already takes a completed
 * order (`hasAnyOrder`), so this is not a spam gate; it is the difference
 * between "I own this" and "I have opinions about this", and only the first one
 * is worth showing unread. It also means the moderation queue is the small pile
 * that actually needs a human, rather than every review the shop receives.
 *
 * Deliberately not `server-only`: the storefront's review form uses it to say
 * up front whether what someone is about to write will appear straight away.
 */
export function statusForNewReview(verified: boolean): ReviewStatus {
  return verified ? ReviewStatus.PUBLISHED : ReviewStatus.PENDING;
}

/** Human wording for the state, used in badges and the queue's own copy. */
export const STATUS_LABELS: Record<ReviewStatus, string> = {
  [ReviewStatus.PENDING]: "Pending",
  [ReviewStatus.PUBLISHED]: "Published",
  [ReviewStatus.HIDDEN]: "Hidden",
};

/** Reasons a shopper can pick from when flagging a review. */
export const REPORT_REASONS = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "OFFENSIVE", label: "Offensive or abusive" },
  { value: "OFF_TOPIC", label: "Not about this product" },
  { value: "FAKE", label: "Fake or incentivised" },
  { value: "OTHER", label: "Something else" },
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number]["value"];

const REASON_VALUES = new Set<string>(REPORT_REASONS.map((reason) => reason.value));

export function isReportReason(value: string): value is ReportReasonValue {
  return REASON_VALUES.has(value);
}

/** The label for a stored reason, falling back to the raw value. */
export function reportReasonLabel(value: string): string {
  return REPORT_REASONS.find((reason) => reason.value === value)?.label ?? value;
}
