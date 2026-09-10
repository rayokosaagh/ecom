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
    <section aria-labelledby="specs-heading" className="border-outline-variant/70 mt-16 border-t pt-10">
      <h2
        id="specs-heading"
        className="text-on-surface text-headline-sm"
      >
        Specifications
      </h2>
      <p className="text-on-surface-variant mt-2 text-sm">
        The details that make the difference, all in one place.
      </p>

      {highlights.length > 0 && (
        <ul aria-label="Key specifications" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {highlights.map((row) => (
            <li
              key={row.label}
              className="bg-surface-container-low border-outline-variant/70 min-w-0 rounded-2xl border p-4 sm:p-5"
            >
              <span className="bg-primary-container text-on-primary-container grid size-10 place-items-center rounded-xl">
                <Icon name={row.icon ?? GROUP_FALLBACK_ICON} size={21} />
              </span>
              <p className="text-on-surface-variant mt-4 text-xs leading-relaxed font-medium text-pretty [overflow-wrap:anywhere]">
                {row.label}
              </p>
              <p className="text-on-surface mt-1 text-base leading-snug font-semibold text-pretty [overflow-wrap:anywhere]">
                {formatSpecValue(row.value, row.unit)}
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
      <div className={cn("mt-6 gap-x-5", groups.length > 1 && "lg:columns-2")}>
        {groups.map((group) => (
          <div
            key={group.name ?? "__ungrouped"}
            className="border-outline-variant/70 mb-5 break-inside-avoid overflow-hidden rounded-2xl border"
          >
            <div className="bg-surface-container-low border-outline-variant/70 flex items-center gap-3 border-b px-5 py-4">
              <span className="bg-surface-container-highest text-primary grid size-9 shrink-0 place-items-center rounded-xl">
                <Icon name={group.icon} size={19} />
              </span>
              <h3 className="text-on-surface min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">
                {group.name ?? "Overview"}
              </h3>
              <span className="text-on-surface-variant shrink-0 text-xs tabular-nums">
                {group.rows.length} {group.rows.length === 1 ? "detail" : "details"}
              </span>
            </div>

            {/* No per-row glyphs. One icon per section is orientation; one per
                line was twenty-two marks competing with the values they were
                meant to introduce. */}
            <dl className="divide-outline-variant/40 divide-y">
              {group.rows.map((row) => {
                const value = formatSpecValue(row.value, row.unit);
                const prose = value.length > PROSE_VALUE_LENGTH;

                return (
                  <div
                    key={row.label}
                    // Long prose stays stacked; short values align beside
                    // their labels once the viewport has room.
                    className={cn(
                      "grid grid-cols-1 gap-x-5 gap-y-1 px-5 py-3.5 even:bg-surface-container-low/50",
                      !prose &&
                        "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-baseline",
                    )}
                  >
                    <dt className="text-on-surface-variant min-w-0 text-sm leading-relaxed text-pretty [overflow-wrap:anywhere]">
                      {row.label}
                    </dt>
                    <dd className="text-on-surface min-w-0 text-sm leading-relaxed font-medium text-pretty [overflow-wrap:anywhere]">
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
