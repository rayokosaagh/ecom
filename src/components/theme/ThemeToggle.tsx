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
 *
 * The glyph goes with it, and that is what makes the swap visible. During a view
 * transition the live page is replaced by a snapshot for the length of the
 * animation, so a moon turning into a sun *inside* the page would play behind a
 * still image and be over by the time anyone saw it. Handing the element over
 * lets the provider give it a `view-transition-name`, which lifts it out of the
 * page snapshot into one of its own — so it rotates over the sweep rather than
 * under it. The animation itself is `theme-glyph-out`/`-in` in `globals.css`.
 *
 * `GLYPH_CLASS` is the handle: the glyph is `IconButton`'s own child, so this is
 * how the click handler finds it without reaching for `firstElementChild` and
 * hoping the button never grows a second one.
 */
const GLYPH_CLASS = "theme-toggle-glyph";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);

  const upcoming = otherTheme(resolvedTheme);

  return (
    <IconButton
      ref={ref}
      icon={THEME_ICONS[upcoming]}
      iconClassName={GLYPH_CLASS}
      label={`Switch to ${THEME_LABELS[upcoming].toLowerCase()} mode`}
      onClick={() => {
        const box = ref.current?.getBoundingClientRect();
        toggleTheme({
          origin: box
            ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
            : undefined,
          glyph: ref.current?.querySelector<HTMLElement>(`.${GLYPH_CLASS}`),
        });
      }}
      className={className}
    />
  );
}
