"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  isTheme,
  otherTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

/** Where the sweep starts from — the centre of the control that was pressed. */
export type SweepOrigin = { x: number; y: number };

type ThemeContextValue = {
  /** The stored choice, or null while the OS is still deciding. */
  theme: Theme | null;
  /** What is actually on screen right now. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme, origin?: SweepOrigin) => void;
  /** Flips whatever is currently rendered. */
  toggleTheme: (origin?: SweepOrigin) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/*
 * The theme lives in a cookie and the OS setting, not in React — so it is read
 * through useSyncExternalStore rather than mirrored into state with an effect.
 * The cookie is also what the server reads to render `data-theme` during SSR,
 * which is what keeps the first paint flash-free without an inline script.
 */

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  // Still subscribed to the OS even though "system" is no longer a choice: a
  // visitor who has never touched the toggle is following it, and their laptop
  // switching at sunset has to move the page with it.
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

/**
 * The stored choice, or null.
 *
 * A cookie left over from when "system" was a value fails `isTheme` and reads
 * as null — which lands that visitor back on the OS setting rather than on an
 * arbitrary light. That is the same thing their old cookie asked for, so the
 * removal of the third state migrates itself and no one is switched under.
 */
function readCookie(): Theme | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`),
  );
  const value = match ? decodeURIComponent(match[1]) : null;
  return isTheme(value) ? value : null;
}

function readResolved(): ResolvedTheme {
  return readCookie() ?? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
}

/**
 * `document.startViewTransition`, if this browser has it.
 *
 * Typed here rather than relied on from the DOM lib, which does not carry it in
 * every TypeScript version this project might be built with.
 */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function ThemeProvider({
  children,
  initialTheme = null,
}: {
  children: ReactNode;
  /** Read from the cookie by the server, so SSR and hydration agree. */
  initialTheme?: Theme | null;
}) {
  // Snapshots are primitives, so referential stability is automatic.
  const serverTheme = useCallback(() => initialTheme, [initialTheme]);
  // The server cannot know the OS setting, so an unset preference renders light
  // and `useSyncExternalStore` corrects it the moment it hydrates. `<html>`
  // carries `suppressHydrationWarning` for exactly this.
  const serverResolved = useCallback(
    (): ResolvedTheme => initialTheme ?? "light",
    [initialTheme],
  );

  const theme = useSyncExternalStore(subscribe, readCookie, serverTheme);
  const resolvedTheme = useSyncExternalStore(subscribe, readResolved, serverResolved);

  const setTheme = useCallback((next: Theme, origin?: SweepOrigin) => {
    const root = document.documentElement;

    const commit = () => {
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
      // Applied straight away rather than waiting for a re-render, so the paint
      // and the cookie never disagree for a frame.
      root.setAttribute("data-theme", next);
      emitChange();
    };

    const doc = document as ViewTransitionDocument;
    const reduced = window.matchMedia(REDUCED_QUERY).matches;

    // No origin means the toggle was reached some way that has no position —
    // and a circle has to start somewhere. Falling back to a plain swap is
    // better than sweeping from an arbitrary corner.
    if (reduced || !origin || typeof doc.startViewTransition !== "function") {
      commit();
      return;
    }

    // The circle has to cover the furthest corner from where it started, or it
    // stops mid-page with the old theme still showing in the far edge.
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );

    root.style.setProperty("--sweep-x", `${origin.x}px`);
    root.style.setProperty("--sweep-y", `${origin.y}px`);
    root.style.setProperty("--sweep-r", `${radius}px`);
    root.dataset.sweeping = "";

    const transition = doc.startViewTransition(commit);

    void transition.finished.finally(() => {
      delete root.dataset.sweeping;
      root.style.removeProperty("--sweep-x");
      root.style.removeProperty("--sweep-y");
      root.style.removeProperty("--sweep-r");
    });
  }, []);

  const toggleTheme = useCallback(
    (origin?: SweepOrigin) => setTheme(otherTheme(readResolved()), origin),
    [setTheme],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return context;
}
