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
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  isTheme,
  nextTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  /** The user's choice, including "system". */
  theme: Theme;
  /** What is actually on screen right now. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Advances Light → Dark → System → Light. */
  cycleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

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

  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

function readCookie(): Theme {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`),
  );
  const value = match ? decodeURIComponent(match[1]) : null;
  return isTheme(value) ? value : DEFAULT_THEME;
}

function readResolved(): ResolvedTheme {
  const theme = readCookie();
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: ReactNode;
  /** Read from the cookie by the server, so SSR and hydration agree. */
  initialTheme?: Theme;
}) {
  // Snapshots are primitives, so referential stability is automatic.
  const serverTheme = useCallback(() => initialTheme, [initialTheme]);
  const serverResolved = useCallback(
    (): ResolvedTheme => (initialTheme === "system" ? "light" : initialTheme),
    [initialTheme],
  );

  const theme = useSyncExternalStore(subscribe, readCookie, serverTheme);
  const resolvedTheme = useSyncExternalStore(subscribe, readResolved, serverResolved);

  const setTheme = useCallback((next: Theme) => {
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;

    // Apply immediately rather than waiting for a re-render. "system" removes
    // the attribute so the prefers-color-scheme rules take over again.
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    emitChange();
  }, []);

  const cycleTheme = useCallback(
    () => setTheme(nextTheme(readCookie())),
    [setTheme],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme],
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
