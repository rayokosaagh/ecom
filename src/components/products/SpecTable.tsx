import { Icon } from "@/components/ui/Icon";
import { formatSpecValue } from "@/lib/specs/keys";

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
              {/* Two lines before clipping: a GPU name is long, and cutting it
                  to "NVIDIA GeForce RTX…" defeats the point of the tile. */}
              <p className="text-on-surface mt-4 line-clamp-2 text-base leading-snug font-medium">
                {formatSpecValue(row.value, row.unit)}
              </p>
              <p className="text-on-surface-variant mt-1 truncate text-xs">
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
            <h3 className="text-on-surface-variant flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
              <Icon name={group.icon} size={16} className="text-primary" />
              {group.name ?? "Overview"}
            </h3>

            {/* No per-row glyphs. One icon per section is orientation; one per
                line was twenty-two marks competing with the values they were
                meant to introduce. */}
            <dl className="divide-outline-variant/50 mt-3 divide-y">
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-baseline gap-6 py-3"
                >
                  <dt className="text-on-surface-variant min-w-0 text-sm">
                    {row.label}
                  </dt>
                  <dd className="text-on-surface min-w-0 text-sm font-medium">
                    {formatSpecValue(row.value, row.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
