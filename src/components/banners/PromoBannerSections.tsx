import { PromoCard, TRIO_VARIANTS } from "./PromoCard";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { getActiveBannerGroups, type BannerGroup } from "@/lib/banners/service";
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

/** Paired sections sit two to a row; the height alternates between rows. */
const PAIRED_COLUMNS = 2;

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
      <p className="text-primary flex items-center gap-2 text-xs font-medium tracking-[0.25em] uppercase">
        <Icon name="category" size={16} filled />
        {category.name}
      </p>

      <h2
        className={cn(
          "text-on-surface mt-3 max-w-2xl leading-[1.1] font-medium tracking-tight text-balance",
          size === "full" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-[1.75rem]",
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
      <ul className="grid items-start gap-x-5 gap-y-12 lg:grid-cols-2">
        {groups.map((group, i) => {
          const banner = group.banners[0];
          const { id, ...card } = banner;
          // Height alternates by row, so the two cards sitting side by side
          // always match and successive rows do not.
          const tall = Math.floor(i / PAIRED_COLUMNS) % 2 === 1;
          return (
            // One stage per cell rather than two: a half-width card and its
            // heading are close enough on screen that staggering them reads as
            // a stutter rather than a sequence. The pair in a row is offset by
            // its column so they do not arrive in lockstep.
            <li key={id}>
              <Reveal delay={(i % PAIRED_COLUMNS) * 90}>
                {group.category && (
                  <Heading category={group.category} size="paired" />
                )}
                <PromoCard {...card} variant={tall ? "panel-tall" : "panel"} />
              </Reveal>
            </li>
          );
        })}
      </ul>
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
