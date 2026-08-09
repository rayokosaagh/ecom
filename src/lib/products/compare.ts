import { formatSpecValue } from "@/lib/specs/keys";

/**
 * Building the comparison table.
 *
 * The useful part of comparing is not seeing every spec side by side — it is
 * seeing the handful that actually differ. Twenty-two rows of which four
 * differ is the spreadsheet problem the shopper opened tabs to solve; showing
 * those four is the answer. So every row records whether it varies, and the
 * page hides the rest behind a toggle.
 *
 * Equality is on `valueKey`, not on the displayed text: "16GB" and "16 GB"
 * are the same answer typed twice and must not read as a difference.
 */

/** More columns than this stop fitting on any screen worth designing for. */
export const MAX_COMPARE = 4;

export interface CompareSpecSource {
  definitionId: string;
  label: string;
  unit: string | null;
  group: string | null;
  icon: string | null;
  sortOrder: number;
  value: string;
  valueKey: string;
}

export interface CompareProductSource {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  brand: { name: string; iconSvg: string | null; logo: string | null } | null;
  /** Fixed specs and variant options, already flattened together. */
  specs: CompareSpecSource[];
}

export interface CompareCell {
  /** Every value this product offers for the label, already unit-formatted. */
  display: string;
  /** Sorted, joined value keys — the identity a row's equality test uses. */
  key: string;
}

export interface CompareRow {
  definitionId: string;
  label: string;
  group: string | null;
  icon: string | null;
  /** One per product, index-aligned with the products passed in. */
  cells: CompareCell[];
  /** False when every product answers this label identically. */
  differs: boolean;
}

export interface CompareGroup {
  name: string | null;
  icon: string | null;
  rows: CompareRow[];
}

/**
 * Collapse one product's answers for one label into a single cell.
 *
 * A label can be answered several times when it is a variant axis — a MacBook
 * sold in 8 and 16 GB has two rows for RAM — so the cell lists both. That is
 * the honest rendering: the machine really is available either way, and
 * picking one would misreport it.
 */
function toCell(specs: CompareSpecSource[]): CompareCell {
  if (specs.length === 0) return { display: "—", key: "" };

  const seen = new Map<string, string>();
  for (const spec of specs) {
    if (!seen.has(spec.valueKey)) {
      seen.set(spec.valueKey, formatSpecValue(spec.value, spec.unit));
    }
  }

  const entries = [...seen.entries()].sort((a, b) => {
    const numberA = Number.parseFloat(a[1]);
    const numberB = Number.parseFloat(b[1]);
    const aNumeric = !Number.isNaN(numberA);
    const bNumeric = !Number.isNaN(numberB);
    if (aNumeric && bNumeric && numberA !== numberB) return numberA - numberB;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a[1].localeCompare(b[1], undefined, { numeric: true });
  });

  return {
    display: entries.map(([, display]) => display).join(", "),
    // Sorted so that a product listing "8, 16" and one listing "16, 8" are
    // recognised as the same answer.
    key: entries
      .map(([valueKey]) => valueKey)
      .sort()
      .join("|"),
  };
}

/**
 * Build the table.
 *
 * Rows come out in definition order and are grouped by section, exactly as the
 * product page lists them — a shopper who has read one product's specs finds
 * the same shape here.
 */
export function buildComparison(products: CompareProductSource[]): CompareGroup[] {
  if (products.length === 0) return [];

  // Every label any of them answers, in definition order.
  const labels = new Map<
    string,
    { label: string; group: string | null; icon: string | null; sortOrder: number }
  >();

  for (const product of products) {
    for (const spec of product.specs) {
      if (!labels.has(spec.definitionId)) {
        labels.set(spec.definitionId, {
          label: spec.label,
          group: spec.group,
          icon: spec.icon,
          sortOrder: spec.sortOrder,
        });
      }
    }
  }

  const ordered = [...labels.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder);

  const rows: CompareRow[] = ordered.map(([definitionId, meta]) => {
    const cells = products.map((product) =>
      toCell(product.specs.filter((spec) => spec.definitionId === definitionId)),
    );

    // A label only one product answers *is* a difference — the others simply
    // do not have it, which is worth seeing.
    const differs = cells.some((cell) => cell.key !== cells[0].key);

    return {
      definitionId,
      label: meta.label,
      group: meta.group,
      icon: meta.icon,
      cells,
      differs,
    };
  });

  // Ungrouped rows first under no heading, then each section in the order its
  // first row appeared — the same rule the product page's spec table follows.
  const groups: CompareGroup[] = [];
  for (const row of rows) {
    const name = row.group ?? null;
    const existing = groups.find((group) => group.name === name);
    if (existing) {
      existing.rows.push(row);
      if (!existing.icon && row.icon) existing.icon = row.icon;
    } else {
      groups.push({ name, icon: row.icon, rows: [row] });
    }
  }
  groups.sort((a, b) => Number(a.name !== null) - Number(b.name !== null));

  return groups;
}

/** How many rows actually differ, for the toggle's label. */
export function countDifferences(groups: CompareGroup[]): number {
  return groups.reduce(
    (total, group) => total + group.rows.filter((row) => row.differs).length,
    0,
  );
}
