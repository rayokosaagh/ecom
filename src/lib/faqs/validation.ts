import type { Validated } from "@/lib/auth/validation";

/**
 * Admin form rules for an FAQ entry.
 *
 * Deliberately free of `server-only` and of any database access, like every
 * other `parse*` in this codebase — the rules are worth exercising directly,
 * and `npm run check:faqs` does exactly that.
 */

/** Long enough for a real question, short enough to stay a heading. */
export const MAX_QUESTION_LENGTH = 200;

/** Long enough for a few paragraphs, short enough not to become a page. */
export const MAX_ANSWER_LENGTH = 2000;

export type FaqInput = {
  question: string;
  answer: string;
  published: boolean;
};

export function parseFaq(formData: FormData): Validated<FaqInput> {
  const errors: Record<string, string> = {};

  // Trimmed before anything else looks at them: whitespace around a textarea's
  // contents is almost always accidental, and an answer of nothing but spaces
  // has to read as missing rather than as provided. Trimming first also means
  // the length checks below measure the text that will actually be stored.
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const published = formData.get("published") === "on";

  if (!question) errors.question = "Question is required";
  else if (question.length > MAX_QUESTION_LENGTH) {
    errors.question = `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`;
  }

  if (!answer) errors.answer = "Answer is required";
  else if (answer.length > MAX_ANSWER_LENGTH) {
    errors.answer = `Answer must be ${MAX_ANSWER_LENGTH} characters or fewer`;
  }

  // Every problem at once — reporting one at a time makes an admin submit
  // repeatedly to discover them all.
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { question, answer, published } };
}
