import "server-only";

import { prisma } from "@/lib/prisma";
import { specLabelKey } from "@/lib/specs/keys";
import type { SpecInput } from "@/lib/specs/parse";

/**
 * Create-or-reuse for spec labels, matching `categories/resolve`.
 *
 * Matching is on key rather than label for the same reason categories match on
 * slug: "RAM" and "Ram" are one label, and letting them become two would split
 * the facet that filtering depends on.
 *
 * An existing definition is reused as-is — its unit, group, order and
 * `filterable` flag are left alone. Those are set deliberately from
 * /admin/specs, and silently rewriting them because someone typed the label
 * into a product form would be a destructive surprise.
 */
export async function resolveSpecDefinitions(
  specs: SpecInput[],
): Promise<Map<string, string>> {
  if (specs.length === 0) return new Map();

  const keys = specs.map((spec) => spec.labelKey);

  const existing = await prisma.specDefinition.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });

  const byKey = new Map(existing.map((definition) => [definition.key, definition.id]));

  // New labels go to the end of the running order, so an unranked definition
  // never jumps above one that was placed deliberately.
  const missing = specs.filter((spec) => !byKey.has(spec.labelKey));
  if (missing.length > 0) {
    const last = await prisma.specDefinition.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let next = (last?.sortOrder ?? -1) + 1;

    for (const spec of missing) {
      const created = await prisma.specDefinition.create({
        data: { label: spec.label, key: spec.labelKey, sortOrder: next++ },
        select: { id: true, key: true },
      });
      byKey.set(created.key, created.id);
    }
  }

  return byKey;
}

/**
 * Adopt the spelling already in use for a value that other products share.
 *
 * "16GB" and "16 GB" resolve to one key and so already filter together, but
 * they would render differently down a comparison table. Reusing the
 * established spelling keeps the catalogue looking edited rather than typed.
 */
export async function canonicalizeSpecValues(
  rows: { definitionId: string; value: string; valueKey: string }[],
): Promise<{ definitionId: string; value: string; valueKey: string }[]> {
  if (rows.length === 0) return rows;

  const known = await prisma.productSpec.findMany({
    where: {
      OR: rows.map((row) => ({
        definitionId: row.definitionId,
        valueKey: row.valueKey,
      })),
    },
    distinct: ["definitionId", "valueKey"],
    select: { definitionId: true, valueKey: true, value: true },
  });

  const spelling = new Map(
    known.map((row) => [`${row.definitionId}:${row.valueKey}`, row.value]),
  );

  return rows.map((row) => ({
    ...row,
    value: spelling.get(`${row.definitionId}:${row.valueKey}`) ?? row.value,
  }));
}

/** Definitions offered in the product form's label autocomplete. */
export async function getSpecLabels(): Promise<string[]> {
  const definitions = await prisma.specDefinition.findMany({
    orderBy: { sortOrder: "asc" },
    select: { label: true },
  });
  return definitions.map((definition) => definition.label);
}

/** Re-exported so callers do not need to reach into two modules. */
export { specLabelKey };
