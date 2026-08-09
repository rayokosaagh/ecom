"use client";

import { useTheme } from "./ThemeProvider";
import { IconButton } from "@/components/ui/IconButton";
import { THEME_ICONS, THEME_LABELS, nextTheme } from "@/lib/theme";

/**
 * Cycles Light → Dark → System.
 *
 * The icon reflects the user's *choice*, so "system" shows the auto glyph
 * rather than pretending to be whichever scheme is currently resolved. No
 * mounted flag is needed — useSyncExternalStore renders the server snapshot
 * during hydration and swaps to the real value immediately after.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const upcoming = nextTheme(theme);

  return (
    <IconButton
      icon={THEME_ICONS[theme]}
      label={`Theme: ${THEME_LABELS[theme]}${
        theme === "system" ? ` (${resolvedTheme})` : ""
      }. Switch to ${THEME_LABELS[upcoming]}.`}
      onClick={cycleTheme}
      className={className}
    />
  );
}
