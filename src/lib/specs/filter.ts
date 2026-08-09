import type { Prisma } from "@/generated/prisma/client";

/**
 * Spec filtering on the catalogue.
 *
 * Selections travel as a repeated `spec` parameter of `label:value` keys:
 *
 *   /products?spec=ram:16gb&spec=ram:32gb&spec=switch-type:brown
 *
 * One repeated parameter rather than a parameter per label (`?ram=16gb`),
 * because the set of labels is data — an admin adds one from the product form.
 * Dynamic top-level parameter names would collide with `q`, `sort`, `min` and
 * the rest the first time someone created a label called "sort".
 *
 * Values within a label are OR-ed and labels are AND-ed: "16GB or 32GB, and
 * brown switches" is what picking two RAM options and one switch means.
 */

/** Selected value keys, grouped by label key. */
export type SpecSelection = Map<string, Set<string>>;

export function parseSpecParams(raw: string | string[] | undefined): SpecSelection {
  const selection: SpecSelection = new Map();
  if (!raw) return selection;

  for (const entry of Array.isArray(raw) ? raw : [raw]) {
    // Only the first colon separates; value keys never contain one, but
    // splitting on all of them would silently drop malformed input instead of
    // ignoring it.
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;

    const labelKey = entry.slice(0, separator).trim();
    const valueKey = entry.slice(separator + 1).trim();
    if (!labelKey || !valueKey) continue;

    const values = selection.get(labelKey) ?? new Set<string>();
    values.add(valueKey);
    selection.set(labelKey, values);
  }

  return selection;
}

/**
 * Prisma clauses for a selection, one per label.
 *
 * @param exclude Label key to leave out. Facet counts for a label are computed
 *   with every filter *except* that label's own — including it would leave
 *   only the already-selected options on screen, with no way to add a second
 *   without clearing first. Same rule the brand facet follows.
 */
export function specWhereClauses(
  selection: SpecSelection,
  exclude?: string,
): Prisma.ProductWhereInput[] {
  const clauses: Prisma.ProductWhereInput[] = [];

  for (const [labelKey, values] of selection) {
    if (labelKey === exclude || values.size === 0) continue;

    const match = {
      definition: { key: labelKey },
      valueKey: { in: [...values] },
    };

    // A label can be answered two ways: fixed for the whole product, or
    // varying across its configurations. "16 GB" has to find the MacBook that
    // is *sold* in 16 GB just as surely as the desktop that simply has it, so
    // both sides are searched.
    clauses.push({
      OR: [
        { specs: { some: match } },
        { variants: { some: { options: { some: match } } } },
      ],
    });
  }

  return clauses;
}

/** Flat `label:value` list, for rebuilding a query string. */
export function toSpecParams(selection: SpecSelection): string[] {
  const params: string[] = [];
  for (const [labelKey, values] of selection) {
    for (const valueKey of values) params.push(`${labelKey}:${valueKey}`);
  }
  return params;
}

/**
 * The selection with one option flipped on or off.
 *
 * Returns a new map — the caller renders a link per option, and mutating a
 * shared selection while building them would make each href depend on the one
 * before it.
 */
export function toggleSpec(
  selection: SpecSelection,
  labelKey: string,
  valueKey: string,
): SpecSelection {
  const next: SpecSelection = new Map(
    [...selection].map(([key, values]) => [key, new Set(values)]),
  );

  const values = next.get(labelKey) ?? new Set<string>();
  if (values.has(valueKey)) values.delete(valueKey);
  else values.add(valueKey);

  if (values.size === 0) next.delete(labelKey);
  else next.set(labelKey, values);

  return next;
}

/** The selection with one label cleared entirely. */
export function clearSpec(selection: SpecSelection, labelKey: string): SpecSelection {
  const next: SpecSelection = new Map(
    [...selection].map(([key, values]) => [key, new Set(values)]),
  );
  next.delete(labelKey);
  return next;
}

export function countSelected(selection: SpecSelection): number {
  let total = 0;
  for (const values of selection.values()) total += values.size;
  return total;
}
