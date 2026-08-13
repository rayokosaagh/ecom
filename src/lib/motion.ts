/*
 * The M3 motion tokens, restated for the half of the app that animates in
 * JavaScript.
 *
 * `globals.css` already owns this vocabulary — `--ease-standard`, the duration
 * scale, and since the retargeting block there, every CSS transition in the app
 * whether or not it names a curve. Framer Motion cannot read any of it: it
 * interpolates in JS and needs the bezier as four numbers, so a `var()` is not
 * an option and the values have to exist twice.
 *
 * Twice is the point. They existed *seven* times before this file — `[0.2, 0,
 * 0, 1]` written out at six call sites, plus the CSS — and four more motion
 * sites that should have had it had nothing at all, so they silently ran Framer's
 * default `easeOut` and were the only elements in the app arriving on a
 * different curve from everything around them. A magic bezier copied by hand is
 * a token that has stopped being one.
 *
 * Anything that can animate in CSS still should: it runs off the main thread
 * and it reads the real tokens. This file is for what genuinely cannot —
 * presence (`AnimatePresence`), drag, and layout animation.
 */

/** M3 standard easing. The default for anything that is not entering or leaving:
 *  state changes, rotations, a chevron flipping. Mirrors `--ease-standard`. */
export const EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1];

/** M3 emphasized decelerate — fast off the mark, long unhurried settle. For an
 *  element arriving. Mirrors `--ease-emphasized`. */
export const EASE_EMPHASIZED: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

/** The mirror of the above, for an element leaving: gathers speed as it goes.
 *  Mirrors `--ease-emphasized-accelerate`. */
export const EASE_EMPHASIZED_ACCELERATE: [number, number, number, number] = [
  0.3, 0, 0.8, 0.15,
];

/**
 * The duration scale from `globals.css`, in the seconds Framer expects rather
 * than the milliseconds CSS does. Same names, so a value can be chosen by what
 * it is for in either layer and the two cannot drift apart unnoticed.
 */
export const DURATION = {
  /** 100ms — a control acknowledging a press. */
  short2: 0.1,
  /** 200ms — the default state change. */
  short4: 0.2,
  /** 250ms — something entering or leaving within a view. */
  medium1: 0.25,
  /** 300ms */
  medium2: 0.3,
  /** 400ms */
  medium4: 0.4,
  /** 500ms — a change that restructures what is on screen. */
  long2: 0.5,
} as const;

/**
 * The transition a dropdown panel opens and closes with. Short and on the
 * standard curve because the panel is small and the pointer is already on it —
 * an emphasized entrance here reads as sluggish rather than considered.
 */
export const PANEL_TRANSITION = {
  duration: 0.15,
  ease: EASE_STANDARD,
} as const;

/**
 * Springs, for the two things that are grabbed or thrown rather than shown.
 * M3 leans on springs for exactly this — motion the user's own gesture is
 * driving — and a duration would have to guess at a distance the gesture
 * decides.
 */
export const SPRING = {
  /** Panels and menus opening under a press. */
  panel: { type: "spring", stiffness: 380, damping: 32 },
  /** The cart/notification count popping in: stiffer and less damped, so it
   *  overshoots just enough to be noticed at 16px across. */
  badge: { type: "spring", stiffness: 500, damping: 22 },
} as const;

/**
 * What every animated component hands Framer when the reader has asked for
 * reduced motion. Zero duration rather than no animation, so the element still
 * lands in its final state and `AnimatePresence` still unmounts it — removing
 * the transition entirely would strand exiting nodes in the tree.
 */
export const NO_MOTION = { duration: 0 } as const;
