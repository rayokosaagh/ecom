"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { DURATION, EASE_EMPHASIZED, NO_MOTION } from "@/lib/motion";

/**
 * A detail panel that slides in from the right.
 *
 * The pattern this exists for: opening a record without leaving the list. A
 * moderation queue is worked by comparing rows, and a navigation away and back
 * loses the scroll position, the filters and the reader's place in the pile —
 * so the record comes to the list rather than the list going to the record.
 *
 * Portalled to `document.body` rather than rendered where it is used, for the
 * reason the review lightbox already documents: `position: fixed` resolves
 * against the nearest transformed ancestor, not the viewport, and the dashboard
 * shell has transforms in it.
 *
 * At `sm` and below it is the whole screen rather than a panel with a strip of
 * list showing beside it. A 380px drawer on a 360px phone is a modal wearing a
 * drawer's costume, and the strip of backdrop it leaves is a tap target that
 * throws the panel away by accident.
 */
export function SidePanel({
  open,
  onClose,
  title,
  /** Pinned under the header — the moderation actions, in practice. */
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  /** What had focus before this opened, so it can be handed back. */
  const restoreTo = useRef<HTMLElement | null>(null);

  // Escape closes, and the page behind stops scrolling — a panel that scrolls
  // the list underneath it loses the reader's place, which is the one thing
  // this component exists to protect.
  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      // Back to the row that opened it, so a keyboard reader is returned to
      // their place in the list rather than to the top of the document.
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  // Focus lands inside the panel on open. Without it the next Tab goes to
  // whatever follows the *trigger* in the document, which is behind the scrim.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* The scrim. Its own element rather than a background on the wrapper
              so it can fade on its own timing while the panel slides. */}
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? NO_MOTION : { duration: DURATION.short4 }}
            className="bg-scrim/40 absolute inset-0 cursor-default backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={
              reduceMotion
                ? NO_MOTION
                : { duration: DURATION.medium2, ease: EASE_EMPHASIZED }
            }
            className={cn(
              "bg-surface border-outline-variant shadow-elevation-3 relative flex h-dvh w-full flex-col border-l",
              "sm:w-[min(30rem,100vw)] lg:w-[34rem]",
              "focus-visible:outline-none",
              className,
            )}
          >
            <header className="border-outline-variant flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <h2 className="text-on-surface text-base font-medium">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
              >
                <Icon name="close" size={20} />
              </button>
            </header>

            {/* The only scrolling region. The header and the actions stay put,
                because an action that scrolls off is one a moderator has to go
                looking for after reading the thing they are deciding about. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {children}
            </div>

            {footer && (
              <div className="border-outline-variant bg-surface shrink-0 border-t px-4 py-3 sm:px-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
