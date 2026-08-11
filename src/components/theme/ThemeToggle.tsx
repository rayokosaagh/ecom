"use client";

import { useRef } from "react";

import { useTheme } from "./ThemeProvider";
import { IconButton } from "@/components/ui/IconButton";
import { THEME_ICONS, THEME_LABELS, otherTheme } from "@/lib/theme";

/**
 * Light ⇄ Dark.
 *
 * Two states, not three. It used to cycle through "system" as well, which meant
 * an unlabelled icon button held a choice you could only find by pressing it
 * twice and a glyph — `brightness_auto` — that says nothing to anyone who has
 * not met it before. Following the OS is still what a first-time visitor gets;
 * it is just the default now rather than a position on the switch. See
 * `NO_PREFERENCE`.
 *
 * The icon shows the theme you are about to switch *to*, because with two
 * states this is an action rather than a status: the sun means "go light". The
 * label says so in words, since that reading is a convention and not something
 * a glyph can settle on its own.
 *
 * The button's own centre is handed to `setTheme` so the new theme can be swept
 * in from under the cursor rather than appearing all at once. A keyboard press
 * has a position too — the button is still somewhere on screen — so this works
 * the same way whichever route was taken to it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);

  const upcoming = otherTheme(resolvedTheme);

  return (
    <IconButton
      ref={ref}
      icon={THEME_ICONS[upcoming]}
      label={`Switch to ${THEME_LABELS[upcoming].toLowerCase()} mode`}
      onClick={() => {
        const box = ref.current?.getBoundingClientRect();
        toggleTheme(
          box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : undefined,
        );
      }}
      className={className}
    />
  );
}
