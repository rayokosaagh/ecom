"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * One open menu at a time, across the whole nav bar.
 *
 * ## The bug this exists to fix
 *
 * `ProductsMenu` and `BrandsMenu` each used to own an `open` boolean and a
 * close timer, and each behaved correctly on its own. Together they did not:
 * moving the pointer from one trigger to the other fires `mouseleave` on the
 * first and `mouseenter` on the second in the same gesture, and those two
 * handlers disagreed about urgency. The one being left started a 160ms timer;
 * the one being entered opened immediately. So for at least that long — plus
 * however long the exit animation ran — *both* panels were mounted and fully
 * opaque.
 *
 * That is not a subtle overlap. The panels are `absolute top-full left-0` on
 * their own triggers and 48rem and 36rem wide, so measured at 1512px the
 * catalogue card covered the brand card by 652px: almost the whole of it. It
 * read as one menu drawn on top of another, which is exactly what it was.
 *
 * ## Why a shared value rather than a shorter timer
 *
 * Shortening the close delay narrows the window without closing it, and the
 * delay is doing real work: it is what lets a pointer travel diagonally across
 * the gap between a trigger and its own card without the menu shutting on the
 * way in. The overlap is not a timing problem, it is a *state* problem — two
 * booleans that can both be true encoding something that is really one value
 * with three states: nothing open, catalogue open, brands open.
 *
 * Holding that one value here makes the handover instant and unconditional:
 * `open("brands")` sets the id, which by construction closes the catalogue in
 * the same render. No timer is involved in a sibling swap, so there is no
 * window in which two panels exist.
 *
 * The grace period survives where it is still wanted — leaving the group
 * entirely — because that is a `closeSoon`, and the timer is only ever
 * cancelled, never raced.
 */

/** How long a menu waits before closing once the pointer has left it. */
const CLOSE_DELAY = 160;

/**
 * The panel's own states, shared so the two menus cannot drift apart.
 *
 * `hidden` is a *function* of whether this menu is being replaced, and that is
 * the only reason variants are used here rather than plain `initial`/`animate`/
 * `exit` objects. Framer Motion freezes an exiting element's props: once
 * `AnimatePresence` has taken over a removed child it renders the copy it kept,
 * so an `exit={{ … }}` computed from state reflects the render *before* the
 * close, which for a swap is exactly the render where nothing had swapped yet.
 * Measured, that made a conditional exit transition a no-op — the outgoing
 * panel sat at 0.19 opacity mid-handover either way.
 *
 * `custom` is the documented way through it: `AnimatePresence` re-reads it and
 * passes it to the variant resolver at exit time, so the decision is made when
 * the exit actually runs rather than a render early.
 *
 * Only the replaced case pins a transition. Everything else leaves it unset so
 * the component's own `transition` prop applies, which is what carries the
 * reduced-motion choice.
 */
export const NAV_PANEL_VARIANTS = {
  shown: { opacity: 1, y: 0, scale: 1 },
  hidden: (replaced: boolean) =>
    replaced
      ? { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0 } }
      : { opacity: 0, y: -6, scale: 0.98 },
};

interface MenuController {
  /** Which menu is open, or null. */
  openId: string | null;
  /** Open this one, closing whatever else was open, immediately. */
  open: (id: string) => void;
  /** Close this one after the grace period, if it is still the open one. */
  closeSoon: (id: string) => void;
  /** Close this one now. */
  close: (id: string) => void;
}

function useMenuController(): MenuController {
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // A pending close from an unmounted bar would set state on nothing.
  useEffect(() => cancel, [cancel]);

  const open = useCallback(
    (id: string) => {
      cancel();
      setOpenId(id);
    },
    [cancel],
  );

  /*
   * The `current === id` guard is what makes one shared timer safe.
   *
   * Leaving the catalogue schedules its close; entering brands then cancels
   * that timer outright, so in the ordinary handover it never fires. The guard
   * covers the orderings where it does — a timer that survives a re-render, or
   * a close scheduled for a menu that has since been replaced — by making the
   * callback a no-op unless the menu it was scheduled for is still the one on
   * screen. Without it a late timer from the *outgoing* menu could close the
   * incoming one a moment after it opened.
   */
  const closeSoon = useCallback(
    (id: string) => {
      cancel();
      timer.current = setTimeout(() => {
        setOpenId((current) => (current === id ? null : current));
      }, CLOSE_DELAY);
    },
    [cancel],
  );

  const close = useCallback(
    (id: string) => {
      cancel();
      setOpenId((current) => (current === id ? null : current));
    },
    [cancel],
  );

  return useMemo(
    () => ({ openId, open, closeSoon, close }),
    [openId, open, closeSoon, close],
  );
}

const NavMenuContext = createContext<MenuController | null>(null);

/** Wraps the bar's menus so only one of them can be open. */
export function NavMenuGroup({ children }: { children: ReactNode }) {
  const controller = useMenuController();
  return (
    <NavMenuContext.Provider value={controller}>
      {children}
    </NavMenuContext.Provider>
  );
}

/**
 * The open state and handlers for one menu in the bar.
 *
 * Falls back to a controller of its own when there is no `NavMenuGroup` above
 * it, so a menu dropped somewhere else still opens and closes correctly — it
 * simply has nothing to coordinate with. That is a real fallback rather than a
 * defensive one: a menu that silently stopped working because a wrapper was
 * forgotten would be a worse failure than the overlap this replaces.
 */
export function useNavMenu(id: string) {
  const group = useContext(NavMenuContext);
  // Called unconditionally, as hooks must be; ignored when a group is present.
  const standalone = useMenuController();
  const controller = group ?? standalone;

  const { openId, open, closeSoon, close } = controller;

  return useMemo(
    () => ({
      open: openId === id,
      /**
       * True while some *other* menu in the group is open — so this one is
       * closing because it was replaced, not because the pointer left the bar.
       *
       * Sharing the open state stopped the two panels being open together, but
       * not their animations overlapping: the outgoing card still played its
       * 200ms exit while the incoming one played its entrance, and measured at
       * 40ms into the handover that left the catalogue at 0.23 opacity behind a
       * brands card at 0.71. Behind, because the later sibling paints on top —
       * but the catalogue panel is 48rem against the brands panel's 36rem, so
       * the part that showed was a fading ghost sticking out to the right of
       * the card that replaced it.
       *
       * A menu being dismissed should still fade; a menu being *replaced*
       * should not, for the same reason one does not cross-fade between two
       * tabs of the same control. The panels use this to drop the exit
       * transition on a swap only.
       */
      replaced: openId !== null && openId !== id,
      openNow: () => open(id),
      closeSoon: () => closeSoon(id),
      close: () => close(id),
    }),
    [openId, id, open, closeSoon, close],
  );
}
