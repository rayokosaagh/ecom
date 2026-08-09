import { Icon } from "@/components/ui/Icon";
import { formatSpecValue } from "@/lib/specs/keys";
import { cn } from "@/lib/cn";

export interface SpecTableRow {
  label: string;
  value: string;
  unit: string | null;
  group: string | null;
  icon: string | null;
}

/** Section headings get a glyph, taken from the first spec that sets one. */
const GROUP_FALLBACK_ICON = "tune";

/**
 * How many specs are pulled out as headline tiles.
 *
 * They are simply the first few in definition order, which is the order an
 * admin arranged at /admin/specs — so "what matters most about this product"
 * is an editorial decision made once for the whole catalogue, not a heuristic
 * guessed here.
 */
const HIGHLIGHT_COUNT = 4;

/** Below this the strip is not worth the space; the table alone reads fine. */
const MIN_ROWS_FOR_HIGHLIGHTS = 5;

/**
 * Past this many characters a value stops being a value and starts being a
 * sentence, and it gets the full width with its label above it.
 *
 * Almost every spec in the catalogue is short — "32 GB", "OLED", "2560x1600",
 * and the longest *label* is eighteen characters. But a handful are written as
 * prose: "MagSafe charger, Apple Watch charger, Qi-certified wireless chargers,
 * or USB-C" is seventy-eight. Held in a label-width column inside a two-up
 * layout, that wraps to four or five ragged lines against a label occupying
 * one. Given the row to itself it reads as the sentence it is.
 *
 * Forty is where the two shapes actually part in this catalogue: the longest
 * genuine value ("NVIDIA GeForce RTX 4070", 23) sits well below it, and every
 * entry above it is written with commas and conjunctions.
 */
const PROSE_VALUE_LENGTH = 40;

/**
 * A product's specifications.
 *
 * Two registers rather than one. A flat list of twenty-odd entries gives a
 * shopper no way in — every line looks as important as every other, and the
 * one thing they came to check is somewhere in the middle of it. So the
 * headline specs are lifted into tiles that can be read at a glance, and the
 * full set sits below for anyone who wants it.
 *
 * `<dl>` rather than a `<table>`: these are label/value pairs, not a grid with
 * meaningful columns, and a definition list gets the right screen-reader
 * behaviour without any ARIA.
 */
export function SpecTable({ rows }: { rows: SpecTableRow[] }) {
  if (rows.length === 0) return null;

  const highlights =
    rows.length >= MIN_ROWS_FOR_HIGHLIGHTS ? rows.slice(0, HIGHLIGHT_COUNT) : [];

  // Ungrouped specs come first under no heading, then each named section in
  // the order its first spec appeared — which is definition order, so the
  // sections are stable across products. A later member rejoins its section
  // rather than opening a second one with the same name.
  const groups: { name: string | null; icon: string; rows: SpecTableRow[] }[] = [];
  for (const row of rows) {
    const name = row.group ?? null;
    const existing = groups.find((group) => group.name === name);
    if (existing) {
      existing.rows.push(row);
      if (existing.icon === GROUP_FALLBACK_ICON && row.icon) existing.icon = row.icon;
    } else {
      groups.push({ name, icon: row.icon ?? GROUP_FALLBACK_ICON, rows: [row] });
    }
  }
  groups.sort((a, b) => Number(a.name !== null) - Number(b.name !== null));

  return (
    <section aria-labelledby="specs-heading" className="mt-16">
      <h2
        id="specs-heading"
        className="text-on-surface text-2xl font-medium tracking-tight"
      >
        Specifications
      </h2>

      {highlights.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {highlights.map((row) => (
            <li
              key={row.label}
              className="bg-surface-container-low border-outline-variant/60 rounded-2xl border p-4"
            >
              <Icon
                name={row.icon ?? GROUP_FALLBACK_ICON}
                size={20}
                className="text-primary"
              />
              {/* Three lines before clipping, and wrapping on words rather than
                  anywhere: "NVIDIA GeForce RTX 4070" is 23 characters and the
                  two-line clamp cut it in half on a narrow tile, which is the
                  one thing a headline tile must not do. */}
              <p className="text-on-surface mt-4 line-clamp-3 text-base leading-snug font-medium text-pretty break-words">
                {formatSpecValue(row.value, row.unit)}
              </p>
              {/* Wraps rather than truncates. Labels run to 18 characters
                  ("Operating system", "Battery capacity") and a tile reading
                  "Operating sys…" has lost the only thing naming the value. */}
              <p className="text-on-surface-variant mt-1 text-xs leading-snug text-pretty">
                {row.label}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Columns rather than one long list: a laptop carries twenty-odd
          entries, which as a single column is a scroll with no shape.
          CSS columns rather than a grid because the sections are wildly
          uneven — "Performance" runs six rows where "Software" runs one — and
          a grid would leave the short ones stranded beside the tall ones.
          `break-inside-avoid` is what keeps a heading with its rows. */}
      <div className="mt-10 md:columns-2 md:gap-x-14">
        {groups.map((group) => (
          <div
            key={group.name ?? "__ungrouped"}
            className="mb-9 break-inside-avoid"
          >
            {/* Sentence case, not micro-caps. Uppercase at 0.18em tracking is
                the least legible setting on the page, and these headings are
                what a reader scans to find the section they want — the icon and
                the rule already separate a heading from the rows under it, so
                the letterforms do not have to. */}
            <h3 className="text-on-surface border-outline-variant/70 flex items-center gap-2 border-b pb-2 text-sm font-semibold">
              <Icon name={group.icon} size={16} className="text-primary" />
              {group.name ?? "Overview"}
            </h3>

            {/* No per-row glyphs. One icon per section is orientation; one per
                line was twenty-two marks competing with the values they were
                meant to introduce. */}
            <dl className="divide-outline-variant/50 mt-1 divide-y">
              {group.rows.map((row) => {
                const value = formatSpecValue(row.value, row.unit);
                const prose = value.length > PROSE_VALUE_LENGTH;

                return (
                  <div
                    key={row.label}
                    /* Stacked on a phone, two columns from `sm` — except for a
                       prose value, which stays stacked at every width.

                       The label column is 9rem because the longest label in the
                       catalogue is 18 characters and nothing is served by
                       reserving more: this list sits inside a two-up column
                       layout, so every rem given to the label is taken from the
                       value beside it. At the old 11rem and gap-6 the long
                       values wrapped to five lines.

                       Baseline alignment, so a value that still wraps starts
                       level with its label rather than floating above it. */
                    className={cn(
                      "grid grid-cols-1 gap-x-4 gap-y-0.5 py-3",
                      !prose &&
                        "sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:items-baseline",
                    )}
                  >
                    <dt className="text-on-surface-variant min-w-0 text-sm text-pretty">
                      {row.label}
                    </dt>
                    {/* `break-words` for the value that has no spaces to wrap
                        at — a resolution or a part number — which would
                        otherwise push the column wider than its share. */}
                    <dd className="text-on-surface min-w-0 text-sm leading-relaxed font-medium text-pretty break-words">
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
