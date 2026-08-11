/** The two states the toggle moves between. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * What `data-theme` can be set to.
 *
 * Identical to `Theme` now that the toggle is a two-way switch, and kept as its
 * own name because the two mean different things: `Theme` is what someone
 * chose, `ResolvedTheme` is what is on the screen. They only coincide because
 * there is no longer a choice — "follow the OS" — that resolves to something
 * other than itself.
 */
export type ResolvedTheme = Theme;

/**
 * Stored in a cookie rather than localStorage so the server can read it and
 * render `data-theme` on <html> during SSR. That removes the need for a
 * blocking inline script, which React refuses to execute on client renders.
 */
export const THEME_COOKIE = "ecom-theme";

/** One year — this is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * What a visitor who has never touched the toggle sees.
 *
 * `null`, meaning "no explicit choice" — *not* light. The absence of a stored
 * theme leaves `data-theme` off the root entirely, which is what lets the
 * `prefers-color-scheme` rules in `globals.css` decide. Someone whose laptop is
 * in dark mode gets a dark shop on their first visit without ever having asked.
 *
 * This is the part of "system" worth keeping. It was removed as a *button*
 * because a third position on an unlabelled icon is a puzzle, not because
 * following the OS is wrong — so it survives as the default rather than as a
 * state anybody has to discover.
 */
export const NO_PREFERENCE = null;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * The other one.
 *
 * Takes the theme currently *rendered* rather than the one stored, because
 * until someone first touches the toggle nothing is stored — and a switch has
 * to flip what the reader can actually see, not what a cookie failed to say.
 */
export function otherTheme(current: ResolvedTheme): Theme {
  return current === "dark" ? "light" : "dark";
}

export const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
};

export const THEME_ICONS: Record<Theme, string> = {
  light: "light_mode",
  dark: "dark_mode",
};
