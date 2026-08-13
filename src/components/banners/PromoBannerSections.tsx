import { PromoCard, TRIO_VARIANTS } from "./PromoCard";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { getActiveBannerGroups, type BannerGroup } from "@/lib/banners/service";
import { categoryIcon } from "@/lib/categories/icons";
import { cn } from "@/lib/cn";

/**
 * Promo sections.
 *
 * Two shapes, chosen by how much a category has to show rather than by taste:
 *
 *  - a category with several banners gets its own full-width row, three up,
 *    cycling the tinted trio of layouts;
 *  - categories with a single banner are paired two to a row, so a lone promo
 *    is a half-width card instead of stretching across the page and leaving a
 *    wide empty gutter beside its copy.
 *
 * The "Shop X" link that used to sit beside each headline is gone: the card
 * already carries an authored CTA with its own label and destination, and two
 * controls for one action made the headers look mismatched.
 */

/** A category needs at least this many banners to hold a row of its own. */
const OWN_ROW = 2;

function Heading({
  category,
  size,
}: {
  category: NonNullable<BannerGroup["category"]>;
  /** Paired cells are half-width, so their headings step down a level. */
  size: "full" | "paired";
}) {
  const lead = category.tagline ?? "Shop";
  const accent = category.taglineAccent ?? category.name;

  return (
    <div className="mb-5">
      {/* The glyph is derived from the category's own name, the same rules the
          products menu uses — so a shelf carries one mark wherever it appears.
          The generic `category` icon that was here said only "this is a
          category", which the name below already says. */}
      <p className="eyebrow text-primary flex items-center gap-2">
        <Icon name={categoryIcon(category.name)} size={16} filled />
        {category.name}
      </p>

      <h2
        className={cn(
          "text-on-surface mt-3 max-w-2xl",
          size === "full"
            ? "text-headline-md sm:text-headline-lg"
            : "text-headline-sm sm:text-headline-md",
        )}
      >
        {lead}{" "}
        <span className="accent-word">
          {accent}
        </span>
      </h2>
    </div>
  );
}

/** A category with enough banners to fill a row on its own. */
function WideSection({ group }: { group: BannerGroup }) {
  const { category, banners } = group;

  return (
    <section
      aria-label={category ? `${category.name} promotions` : "Promotions"}
      className="mx-auto max-w-7xl px-4 sm:px-6"
    >
      {/* Staged reveal as the section scrolls in. This lives here rather than
          on the featured showcase because that one sits directly under the
          hero — it is already in the viewport on load, so there is nothing
          left to reveal by the time anyone scrolls. */}
      {category && (
        <Reveal>
          <Heading category={category} size="full" />
        </Reveal>
      )}

      {/* On a phone this is a swipeable row rather than a stack. Three
          full-width cards one under the other ran to roughly 1170px — over
          three screens — for a single section. Snapping them side by side
          keeps it to one card's height, and the sliver of the next card is
          what tells you there is more.

          The negative margin cancels the section's own padding so the row can
          bleed to both edges, while the matching padding keeps the first card
          aligned with the heading above it. From `sm` up nothing changes: it
          is the original grid. */}
      <Reveal delay={120}>
      <ul
        className={cn(
          // The cards deal out one at a time as the row scrolls in — see
          // `.deal-reveal` in globals.css. `-rail` is required rather than
          // decorative: below `sm` this row is `overflow-x-auto`, and a
          // downward translate inside a horizontal scroller makes it
          // scrollable vertically too.
          //
          // The `Reveal` around it stays. It looks redundant now that the
          // cards reveal themselves, and it is not: it is what gates the
          // *fallback* path in browsers with no scroll timeline, where the
          // animation is on a clock and would otherwise run during page load.
          "deal-reveal deal-reveal-rail",
          "-mx-4 flex snap-x snap-mandatory scroll-pl-4 items-stretch gap-4",
          "overflow-x-auto px-4 pb-2",
          // The peek of the next card is the affordance; a scrollbar under it
          // would only add noise.
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0",
          "lg:grid-cols-3",
        )}
      >
        {banners.map(({ id, ...card }, i) => (
          <li key={id} className="w-[85%] shrink-0 snap-start sm:w-auto sm:shrink">
            <PromoCard {...card} variant={TRIO_VARIANTS[i % TRIO_VARIANTS.length]} />
          </li>
        ))}
      </ul>
      </Reveal>
    </section>
  );
}

/**
 * Single-banner categories, two to a row.
 *
 * Each cell carries its own heading above its card, so pairing two categories
 * side by side does not merge them into one section.
 */
function PairedSections({ groups }: { groups: BannerGroup[] }) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/*
        One `Reveal` around the grid rather than one inside every cell.

        The cells used to carry their own, each with a delay derived from its
        column so a pair did not arrive in lockstep. `.deal-reveal` expresses
        the same idea against scroll position instead of a timer, and it has to
        own the whole grid to do it: the stagger comes from each child's slice
        of one shared timeline, which cannot be assembled from per-cell
        wrappers. That also fixes what the column offset could only approximate
        — the second row is now genuinely later than the first, rather than
        repeating the same two-step.

        The wrapper here is what gates the fallback path where scroll timelines
        are unsupported, exactly as it does on the wide rows above.
      */}
      <Reveal>
      <ul className="deal-reveal grid items-start gap-x-5 gap-y-12 lg:grid-cols-2">
        {groups.map((group) => {
          const banner = group.banners[0];
          const { id, ...card } = banner;
          return (
            // Heading and card share one cell and arrive together: they are
            // close enough on screen that staggering them reads as a stutter
            // rather than as a sequence.
            <li key={id}>
                {group.category && (
                  <Heading category={group.category} size="paired" />
                )}
                {/*
                  One variant for every cell, so all four cards in the grid are
                  the same template.

                  This used to alternate: row 0 took `panel` at 12rem and row 1
                  `panel-tall` at 19.5rem, on the reasoning that a pair sitting
                  side by side should match while successive rows need not. That
                  holds for a long, ragged list of promos. It does not hold for
                  the four category cards this actually renders — Audio,
                  Peripherals, Accessories, Lighting — which read as one 2x2 set,
                  and where the bottom row standing 7.5rem taller than the top
                  looks like two of them are broken rather than like a rhythm.

                  Height is the whole difference: both variants take the same
                  `panel` branch in PromoCard, so the badge, the accent rule, the
                  heading and the copy block were already identical. What the
                  alternation changed was the fixed 13rem image column's aspect
                  ratio — 13x12 against 13x19.5 — which is what made the four
                  images look inconsistently cropped.
                */}
                <PromoCard {...card} variant="panel" />
            </li>
          );
        })}
      </ul>
      </Reveal>
    </div>
  );
}

/**
 * Server component that renders the live promo banners, grouped by category.
 *
 * Fetches its own data, so dropping it into a page is a one-line change, and
 * reads through `getActiveBannerGroups`, which is uncached — an admin edit
 * shows up on the next page view with no redeploy.
 *
 * Renders nothing when there are no banners, so a page including it does not
 * grow an empty gap before the first one exists.
 */
export async function PromoBannerSections({ className }: { className?: string }) {
  const groups = await getActiveBannerGroups();
  if (groups.length === 0) return null;

  // Order is preserved from the banners themselves, so the pairs follow the
  // sequence the admin arranged by dragging.
  const wide = groups.filter((g) => g.banners.length >= OWN_ROW);
  const paired = groups.filter((g) => g.banners.length < OWN_ROW);

  return (
    <div className={cn("space-y-12 sm:space-y-16", className)}>
      {wide.map((group) => (
        <WideSection key={group.category?.slug ?? "uncategorised"} group={group} />
      ))}
      {paired.length > 0 && <PairedSections groups={paired} />}
    </div>
  );
}
