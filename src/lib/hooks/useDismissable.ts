"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a floating element on outside pointer-down or Escape.
 *
 * Shared by the avatar menu, notification panel, search field and mobile menu
 * so the dismiss behaviour cannot drift between them.
 *
 * Listeners are only attached while `open`, so a closed dropdown costs nothing.
 *
 * @param triggerRef The control that toggles the element, for the case where it
 *   sits *outside* the panel. Without it such a trigger closes the panel on
 *   `mousedown`/`touchstart` and its own `click` immediately reopens it, so the
 *   button looks dead. Menus whose button is nested inside the panel — the
 *   avatar and the bell — never hit this, which is why it only ever showed up
 *   on the one that is not.
 *
 * @returns ref to attach to the element that should count as "inside".
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<T>(null);

  // Keep the latest callback without re-subscribing on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onCloseRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    // `mousedown` rather than `click`, so the panel closes before a click
    // handler underneath it can fire.
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // `triggerRef` is a stable ref object; re-subscribing on it would be noise.
  }, [open, triggerRef]);

  return ref;
}
