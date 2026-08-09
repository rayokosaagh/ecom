import type { CSSProperties } from "react";

import { SocialIcon } from "@/components/social/SocialIcon";
import { socialLinkName } from "@/lib/social/catalogue";
import { readableOn, resolveHoverColor } from "@/lib/social/color";
import { getPublishedSocialLinks } from "@/lib/social/service";
import { cn } from "@/lib/cn";

/**
 * "Follow us" — the shop's own accounts, for the home page.
 *
 * Renders nothing at all while no link is published, the same as
 * `FeaturedShowcase` and the FAQ band: a heading inviting people to follow a
 * shop that has nowhere to be followed is worse than no invitation, and the
 * spacing goes with it rather than leaving a gap where a section used to be.
 *
 * At rest every chip is the same neutral disc, so the row reads as one control
 * rather than a fruit salad of competing logos. Colour arrives on hover, one
 * chip at a time, which is where it means something: it confirms *which* icon
 * the pointer is on, in the colour that network is recognised by.
 *
 * The pair of colours is passed as custom properties rather than baked into
 * class names because they are per-row data — Tailwind cannot generate a class
 * for a hex an admin has not typed yet.
 *
 * Every link is `rel="noopener noreferrer"` and opens in a new tab. These are
 * the only outbound links on the page, and a shopper mid-basket who taps one
 * should still have the basket when they come back.
 */
export async function SocialBar({ className }: { className?: string }) {
  const links = await getPublishedSocialLinks();
  if (links.length === 0) return null;

  return (
    <section
      aria-labelledby="follow-us"
      className={cn("mx-auto max-w-7xl px-4 pb-24 sm:px-6", className)}
    >
      <div className="bg-surface-container flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6 sm:p-8">
        <div>
          <h2
            id="follow-us"
            className="text-on-surface text-2xl font-medium tracking-tight sm:text-3xl"
          >
            Follow <span className="accent-word">us</span>
          </h2>
          <p className="text-on-surface-variant mt-2 max-w-prose text-sm">
            New arrivals, restocks and the occasional look behind the bench.
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-2 sm:gap-3">
          {links.map((link) => {
            // The admin's label where there is one, the network's name
            // otherwise — and the same string for both the tooltip and the
            // accessible name, so a sighted and a screen-reader visitor are
            // told the same thing.
            const name = socialLinkName(link.platform, link.label);
            const hover = resolveHoverColor(link.platform, link.hoverColor);

            return (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  title={name}
                  style={
                    {
                      "--social-hover": hover,
                      // Contrast-picked, so no colour an admin chooses can
                      // produce an unreadable glyph. See `readableOn`.
                      "--social-hover-on": readableOn(hover),
                    } as CSSProperties
                  }
                  className={cn(
                    "bg-surface-container-highest text-on-surface-variant",
                    "grid size-12 place-items-center rounded-full",
                    "transition-all duration-200 hover:shadow-elevation-2",
                    "hover:bg-[var(--social-hover)] hover:text-[var(--social-hover-on)]",
                    // The same treatment on keyboard focus. A hover-only accent
                    // would leave someone tabbing the bar with no idea which
                    // chip they are on.
                    "focus-visible:bg-[var(--social-hover)] focus-visible:text-[var(--social-hover-on)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
                  )}
                >
                  <SocialIcon
                    platform={link.platform}
                    iconSvg={link.iconSvg}
                    size={20}
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
