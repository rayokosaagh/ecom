/**
 * The six meanings a status pill is allowed to carry, and the classes for each.
 *
 * This vocabulary already existed — it was just written out longhand in about
 * seven places (order status, stock level, flash sale state, discount validity,
 * payment outcome, stock delta, price delta), each one re-deciding that green
 * means good. Naming it makes the decision reviewable in one file, and makes
 * "which tone is a late order?" a question with an answer rather than a matter
 * of whichever neighbouring component got copied.
 *
 * Not `server-only`: badges render on the server, but the bulk-action bar and
 * the row quick-actions are client components that tint themselves the same way.
 *
 * Every pairing here clears WCAG AA at 4.5:1 in both schemes. That threshold,
 * not 3:1, because pill text is `text-xs` — 12px never counts as large text, so
 * the large-text allowance is never available to it.
 */
export type Tone =
  /** Nothing is owed and nothing is wrong. The resting state. */
  | "neutral"
  /** In flight: someone is working on it, or a machine is. */
  | "info"
  /** It went well. */
  | "success"
  /** Finished — the end of the road, not merely a good step along it. */
  | "done"
  /** Not broken, but a person is expected to act. Kept rare on purpose. */
  | "warning"
  /** It failed, or it was undone. */
  | "danger";

/**
 * The tonal form: a soft container behind text of its own on-colour. The
 * default, because a page of solid pills is a page with no emphasis left.
 */
export const TONE_CONTAINER: Record<Tone, string> = {
  neutral: "bg-surface-container-highest text-on-surface-variant",
  info: "bg-secondary-container text-on-secondary-container",
  success: "bg-tertiary-container text-on-tertiary-container",
  done: "bg-tertiary text-on-tertiary",
  warning: "bg-warning-container text-on-warning-container",
  danger: "bg-error-container text-on-error-container",
};

/**
 * The same six as plain text — for a value inside a table cell, where a pill on
 * every row would turn the column into wallpaper.
 */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-on-surface-variant",
  info: "text-secondary",
  success: "text-tertiary",
  done: "text-tertiary",
  warning: "text-warning",
  danger: "text-error",
};

/** The pill itself, shared so every badge in the app is the same object. */
export const BADGE_SHAPE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium";

/** A tighter one, for a flag that sits *beside* a badge rather than replacing it. */
export const FLAG_SHAPE =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
