"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { DURATION, EASE_EMPHASIZED, NO_MOTION } from "@/lib/motion";

/** How long a message stands before it withdraws. */
const DWELL_MS = 4000;

/**
 * Whether we are past the server render — false on the server, true in the
 * browser.
 *
 * This exists because the snackbar's *container* is portalled into `document.
 * body` unconditionally, which the server cannot do: it renders nothing, the
 * client renders a div, and React calls that a hydration mismatch and throws
 * the tree away. (The media lightbox nearby has no such problem: its portal
 * only exists once something has been clicked, so it cannot differ at
 * hydration time.)
 *
 * `useSyncExternalStore` is the sanctioned way to ask the question — it takes a
 * separate server snapshot, so the first client render matches the server's and
 * the switch happens immediately afterwards. A `useState` + `useEffect` pair
 * does the same job by writing state inside an effect, which is both a wasted
 * render and the thing the lint rules here reject.
 */
const subscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export type ToastTone = "success" | "error";

export interface ToastMessage {
  /** Bumped per message rather than random, so the same words twice re-announce. */
  id: number;
  text: string;
  tone: ToastTone;
}

/**
 * The one-line confirmation after an action that changed something elsewhere.
 *
 * A snackbar rather than a message under the button, because the button is
 * frequently gone by the time there is anything to say: publishing a review
 * from the Pending tab takes it out of the list it was in, so the control that
 * did it has unmounted and any message attached to it goes with it.
 *
 * `role="status"` and `aria-live="polite"`, so the outcome is announced without
 * interrupting — the same contract the inline messages it replaces had.
 *
 * Deliberately not a global provider. One screen needs this today; a context
 * threaded through the root layout to serve one screen is a cost every other
 * page pays, and the shape here is small enough to lift later if a second
 * caller turns up.
 */
export function Toast({
  message,
  onDismiss,
}: {
  message: ToastMessage | null;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const hydrated = useHydrated();

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, DWELL_MS);
    return () => window.clearTimeout(id);
    // `message` is a fresh object per announcement, so a second action restarts
    // the clock rather than inheriting what was left of the first one's.
  }, [message, onDismiss]);

  if (!hydrated) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      // Bottom centre on a phone, bottom left on a desktop: out of the way of
      // the panel that slides in from the right.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:inset-x-auto sm:left-6 sm:justify-start"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={
              reduceMotion
                ? NO_MOTION
                : { duration: DURATION.medium1, ease: EASE_EMPHASIZED }
            }
            className={cn(
              "shadow-elevation-2 pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm",
              message.tone === "error"
                ? "bg-error-container text-on-error-container"
                : "bg-inverse-surface text-inverse-on-surface",
            )}
          >
            <Icon
              name={message.tone === "error" ? "error" : "check_circle"}
              size={18}
              className="shrink-0"
            />
            <span className="min-w-0">{message.text}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-mr-1.5 ml-1 grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-150 hover:bg-current/15 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="close" size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/**
 * The state behind one snackbar slot.
 *
 * A counter rather than a queue: two moderation actions in a row should show
 * the second outcome, not make the reader wait out the first. The counter is
 * what gives each message a fresh key so the exit/enter pair actually plays.
 */
export function useToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  // A ref rather than state: the number is only ever read at the moment a
  // message is created, and nothing renders differently because of it.
  const seq = useRef(0);

  // Both stable, because the snackbar's dwell timer takes `onDismiss` as a
  // dependency — a new identity each render would restart the clock on every
  // parent render and the message would never leave.
  const show = useCallback((text: string, tone: ToastTone = "success") => {
    seq.current += 1;
    setMessage({ id: seq.current, text, tone });
  }, []);

  const dismiss = useCallback(() => setMessage(null), []);

  return { message, show, dismiss };
}
