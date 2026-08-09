/** The three states the toggle cycles through. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** What `data-theme` can be set to — "system" is represented by no attribute. */
export type ResolvedTheme = "light" | "dark";

/**
 * Stored in a cookie rather than localStorage so the server can read it and
 * render `data-theme` on <html> during SSR. That removes the need for a
 * blocking inline script, which React refuses to execute on client renders.
 */
export const THEME_COOKIE = "ecom-theme";

/** One year — this is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_THEME: Theme = "system";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Light → Dark → System → Light. */
export function nextTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
}

export const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export const THEME_ICONS: Record<Theme, string> = {
  light: "light_mode",
  dark: "dark_mode",
  system: "brightness_auto",
};
