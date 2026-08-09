import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { formatSpecValue } from "@/lib/specs/keys";
import { specWhereClauses, type SpecSelection } from "@/lib/specs/filter";

export interface SpecFacetOption {
  valueKey: string;
  /** As typed by whoever entered it, with the label's unit applied. */
  label: string;
  count: number;
  selected: boolean;
}

export interface SpecFacet {
  key: string;
  label: string;
  /** Section this label belongs to, or null. */
  group: string | null;
  /** Material Symbols ligature, already defaulted. */
  icon: string;
  options: SpecFacetOption[];
  /** Products in view carrying this label — drives ordering and the cut below. */
  coverage: number;
}

/** Shown when a label has no icon of its own. */
const FALLBACK_ICON = "label";

/**
 * Smallest share of the current view a label must describe to be offered.
 *
 * Without this, browsing everything hands the shopper every label in the shop
 * at once — "Driver size" and "Bulb type" beside "RAM", each covering three or
 * four products out of twenty-odd. A filter that cannot apply to most of what
 * you are looking at is noise, and a column of them is worse than none.
 *
 * The cut is by coverage rather than by category so it needs no configuration
 * and tightens itself: inside Audio, "Driver size" covers everything and
 * appears; across the whole catalogue it does not.
 */
const MIN_COVERAGE = 0.25;

/**
 * Hard ceiling on how many labels the rail offers at once.
 *
 * Coverage alone does not bound the list — a catalogue of nothing but laptops
 * would pass every label through at 100%. Past roughly a screen's worth the
 * rail stops being a set of choices and becomes a list to read, so the widest
 * are kept and the rest wait until a category narrows things down.
 */
const MAX_FACETS = 10;

/**
 * Order options the way a reader expects.
 *
 * Sorting on the key alone is lexicographic, which puts 8 GB after 64 GB and
 * 1200 lm before 450 lm. Values that begin with a number are compared
 * numerically on that prefix — enough for the quantities specs actually carry
 * ("16", "3440x1440", "2.5") — and anything else falls back to a locale
 * compare so "Gateron Brown" still sorts against "Gateron Red".
 */
function compareOptions(a: string, b: string): number {
  const numberA = Number.parseFloat(a);
  const numberB = Number.parseFloat(b);
  const aIsNumeric = !Number.isNaN(numberA);
  const bIsNumeric = !Number.isNaN(numberB);

  if (aIsNumeric && bIsNumeric && numberA !== numberB) return numberA - numberB;
  // A numeric value sorts ahead of a purely textual one, so a mixed label
  // ("120", "Variable") does not interleave them.
  if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Spec facets for the current view.
 *
 * Each label is counted with every other filter applied but *not* its own, so
 * the options on offer are always the ones that would actually return
 * something, and a second value can be added to a label without clearing the
 * first. That is the same rule the brand facet follows — see the comment on
 * `whereWithoutBrand` in the catalogue page.
 *
 * That rule is why this is a query per label rather than one grouped query:
 * each label needs a different `where`. The count is bounded by the number of
 * filterable labels, they run concurrently, and a shop with enough spec labels
 * for that to hurt has bigger problems than this function.
 */
export async function getSpecFacets(
  /** Every non-spec filter already in force (published, category, price…). */
  baseWhere: Prisma.ProductWhereInput,
  selection: SpecSelection,
): Promise<SpecFacet[]> {
  const [definitions, viewTotal] = await Promise.all([
    prisma.specDefinition.findMany({
      where: { filterable: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, key: true, label: true, unit: true, group: true, icon: true },
    }),
    // Denominator for the coverage cut: how big the view is before any spec
    // filter narrows it, which is the same view the option counts are taken
    // over when nothing in that label is selected.
    prisma.product.count({ where: baseWhere }),
  ]);

  if (definitions.length === 0 || viewTotal === 0) return [];

  /**
   * Counting is one query per *selected* label plus one for everything else,
   * rather than one per label.
   *
   * The per-label `where` only differs for labels that have a selection to
   * exclude; every other label is counted over the identical view, so they
   * collapse into a single grouped query. With nothing selected — the common
   * case — that is one query instead of one per label, which on a catalogue
   * with twenty-odd labels is the difference between a page render that fits
   * in the connection pool and one that does not.
   */
  const allClauses = specWhereClauses(selection);
  const shared = definitions.filter((definition) => !selection.has(definition.key));
  const narrowed = definitions.filter((definition) => selection.has(definition.key));

  const definitionIds = definitions.map((definition) => definition.id);

  /**
   * Every (label, value, product) triple in a view, from both places a label
   * can be answered.
   *
   * Rows rather than a grouped count, because the count that matters is
   * *distinct products* and neither Prisma's `groupBy` nor its `_count` can
   * express COUNT(DISTINCT …). A laptop sold in 16/256 and 16/512 has two
   * variant rows at 16 GB and must still count once against it.
   *
   * The rows also carry the value as written, which saves the separate query
   * that used to fetch display spellings.
   */
  async function collect(ids: string[], where: Prisma.ProductWhereInput) {
    if (ids.length === 0) return [];

    const [specs, options] = await Promise.all([
      prisma.productSpec.findMany({
        where: { definitionId: { in: ids }, product: where },
        select: { definitionId: true, valueKey: true, value: true, productId: true },
      }),
      prisma.productVariantOption.findMany({
        where: { definitionId: { in: ids }, variant: { product: where } },
        select: {
          definitionId: true,
          valueKey: true,
          value: true,
          variant: { select: { productId: true } },
        },
      }),
    ]);

    return [
      ...specs,
      ...options.map((option) => ({
        definitionId: option.definitionId,
        valueKey: option.valueKey,
        value: option.value,
        productId: option.variant.productId,
      })),
    ];
  }

  /**
   * One pass for every label without a selection — they all count over the
   * same view — plus one per label that has one, which has to exclude itself.
   * With nothing selected that is a single pass rather than one per label.
   */
  const batches = await Promise.all([
    collect(
      shared.map((definition) => definition.id),
      allClauses.length > 0 ? { ...baseWhere, AND: allClauses } : baseWhere,
    ),
    ...narrowed.map((definition) =>
      collect([definition.id], {
        ...baseWhere,
        AND: specWhereClauses(selection, definition.key),
      }),
    ),
  ]);

  /** definitionId → valueKey → the products carrying it. */
  const byValue = new Map<string, Map<string, { value: string; products: Set<string> }>>();
  /** definitionId → every product carrying the label at all, for coverage. */
  const byDefinition = new Map<string, Set<string>>();

  for (const id of definitionIds) {
    byValue.set(id, new Map());
    byDefinition.set(id, new Set());
  }

  for (const row of batches.flat()) {
    const values = byValue.get(row.definitionId);
    if (!values) continue;

    const entry = values.get(row.valueKey);
    if (entry) entry.products.add(row.productId);
    else values.set(row.valueKey, { value: row.value, products: new Set([row.productId]) });

    byDefinition.get(row.definitionId)!.add(row.productId);
  }

  const facets: SpecFacet[] = [];

  definitions.forEach((definition) => {
    const selected = selection.get(definition.key) ?? new Set<string>();

    const options = [...(byValue.get(definition.id)?.entries() ?? [])]
      .filter(([, entry]) => entry.products.size > 0)
      .map(([valueKey, entry]) => ({
        valueKey,
        label: formatSpecValue(entry.value, definition.unit),
        count: entry.products.size,
        selected: selected.has(valueKey),
        // Sorted on the value as written rather than the key: the key has had
        // its spaces removed, which does not change the leading number but
        // does make it the wrong thing to show a comparator.
        sortOn: entry.value,
      }))
      .sort((a, b) => compareOptions(a.sortOn, b.sortOn))
      .map(({ sortOn: _sortOn, ...option }) => option);

    // A label with one option filters nothing — every product in view already
    // has it. Hiding it keeps the rail to the choices that are actually
    // choices.
    if (options.length < 2 && selected.size === 0) return;

    // Distinct products carrying the label. Summing the option counts would
    // over-count a product sold in several configurations, which is exactly
    // the case variants introduce.
    const coverage = byDefinition.get(definition.id)?.size ?? 0;

    // A label already in use stays, whatever its coverage — pulling the
    // control out from under an active filter would strand the shopper with a
    // narrowed result set and no way to widen it.
    if (selected.size === 0 && coverage / viewTotal < MIN_COVERAGE) return;

    facets.push({
      key: definition.key,
      label: definition.label,
      group: definition.group,
      icon: definition.icon || FALLBACK_ICON,
      options,
      coverage,
    });
  });

  // Broadest first, so whatever describes most of the view is what the eye
  // lands on. Ties keep the admin's running order.
  facets.sort((a, b) => b.coverage - a.coverage);

  if (facets.length <= MAX_FACETS) return facets;

  // Anything in use is kept whatever its coverage, then the widest fill the
  // remaining places. Dropping a label the shopper is actively filtering by
  // would strand them narrowed with no way to widen.
  const inUse = facets.filter((facet) => selection.has(facet.key));
  const rest = facets.filter((facet) => !selection.has(facet.key));
  const kept = [...inUse, ...rest.slice(0, Math.max(0, MAX_FACETS - inUse.length))];

  return kept.sort((a, b) => b.coverage - a.coverage);
}
