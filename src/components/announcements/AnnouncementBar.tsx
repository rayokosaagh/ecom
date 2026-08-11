import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ANNOUNCEMENT_LEVELS } from "@/lib/announcements/levels";
import { railDurationSeconds, railRepeats } from "@/lib/announcements/rail";
import type { AnnouncementView } from "@/lib/announcements/service";

/**
 * The strip of news under the navigation bar.
 *
 * Rendered *inside* the bar's `<header>`, not beside it, which is what makes it
 * behave: the header is `sticky`, so the strip stays with it rather than
 * scrolling away — and a notice that says payments are down is worth exactly as
 * much as the navigation it is attached to.
 *
 * **Every notice keeps its own colour, and neighbours melt into each other.**
 * Each message sits on a solid block of its level's background; between one
 * message and the next is a band of `linear-gradient` running from the first
 * colour to the second. So a run of Info notices reads as one continuous blue
 * strip, and the moment a Critical one arrives the band bleeds from blue into
 * red rather than switching at a hard edge. Two notices at the same level blend
 * to themselves, which is to say they do not blend at all — the join simply
 * disappears, which is the right answer for two things that are the same.
 *
 * The blend lives in the gap, never under the text. That is a legibility
 * constraint, not a stylistic one: `on-primary-container` is nearly black and
 * `on-error` is white, so a word straddling the transition would be losing
 * contrast against a background that is halfway between its own and something
 * else's. Text sits on solid colour; only the space between messages mixes.
 *
 * The motion is CSS only — no timer, no state, no measuring. See
 * `.announce-rail` for the loop, and `lib/announcements/rail` for how long one
 * copy has to be before that loop is seamless.
 */
export function AnnouncementBar({ items }: { items: AnnouncementView[] }) {
  // Nothing published is not an empty strip — it is no strip. A band of colour
  // saying nothing is worse than the space it takes.
  if (items.length === 0) return null;

  /**
   * How many times the sequence repeats inside one copy of the track.
   *
   * The reason a single short notice used to slide in and stop a quarter of the
   * way across: the track was `max-content` wide, so translating it by half its
   * own width moved it a couple of hundred pixels and left it parked with the
   * rest of the strip empty. A copy has to be at least as wide as the screen
   * for the loop to be continuous, so short content is repeated until it is.
   */
  const repeats = railRepeats(items);
  const duration = railDurationSeconds(items, repeats);

  // The sequence as it actually renders, repeated. Built once and used by both
  // copies, so the two halves cannot drift apart.
  const sequence = Array.from({ length: repeats }, () => items).flat();

  /**
   * One pass of the sequence.
   *
   * Rendered twice by the caller below — that duplication *is* the loop, and it
   * is why the seam is invisible: the copies are identical, so one is exactly
   * half the track's width and translating by half lands the second where the
   * first started. The second copy is `aria-hidden`, so the announcement is
   * read once rather than stuttered.
   */
  const pass = (copy: number) =>
    sequence.map((item, index) => {
      const style = ANNOUNCEMENT_LEVELS[item.level];
      // Whose colour this one melts into. Wraps to the first, because on a loop
      // the last notice really is followed by the first.
      const next = ANNOUNCEMENT_LEVELS[sequence[(index + 1) % sequence.length].level];

      const body = (
        <>
          <Icon name={style.icon} size={16} filled className="shrink-0" />
          {/* `whitespace-nowrap` is load-bearing, not cosmetic: the track is
              sized by its content, and a message allowed to wrap would make the
              two copies different heights and the loop uneven. */}
          <span className="whitespace-nowrap">{item.message}</span>
          {item.href && <Icon name="arrow_forward" size={14} className="shrink-0" />}
        </>
      );

      return (
        <span key={`${copy}-${index}-${item.id}`} className="flex items-stretch">
          <span
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium"
            style={{ backgroundColor: style.bg, color: style.fg }}
          >
            {/* Only a same-site path goes through `Link`. An absolute URL is a
                plain anchor with `rel="noopener noreferrer"` — the router
                cannot prefetch another origin anyway, and handing it one is how
                a perfectly good link starts throwing. `href` was checked before
                it was stored; see `isSafeHref`. */}
            {item.href ? (
              item.href.startsWith("/") ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {body}
                </Link>
              ) : (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {body}
                </a>
              )
            ) : (
              <span className="flex items-center gap-2">{body}</span>
            )}
          </span>

          {/* The join. Wide enough to be a transition rather than a seam, and
              empty of text so nothing has to be readable while the ground under
              it changes colour. */}
          <span
            aria-hidden
            className="w-16 shrink-0"
            style={{ backgroundImage: `linear-gradient(to right, ${style.bg}, ${next.bg})` }}
          />
        </span>
      );
    });

  return (
    <aside
      aria-label="Announcements"
      className="w-full"
      style={{
        // The ground the track runs on. It should never show — one copy is
        // wider than the viewport by construction — but if an estimate ever
        // came up short, a sliver of the first notice's own colour is a far
        // better failure than a sliver of whatever is behind the header.
        backgroundColor: ANNOUNCEMENT_LEVELS[items[0].level].bg,
        ["--announce-rail-duration" as string]: `${duration}s`,
      }}
    >
      <div className="announce-rail-viewport">
        <div className="announce-rail">
          <div className="flex items-stretch">{pass(0)}</div>
          {/* The second copy exists for the eye, not for the reader. */}
          <div aria-hidden className="flex items-stretch">
            {pass(1)}
          </div>
        </div>
      </div>
    </aside>
  );
}
