import { compareAtError } from "@/lib/products/sale";
import { MAX_VARIANTS } from "@/lib/products/variants";
import {
  MAX_SPEC_LABEL_LENGTH,
  MAX_SPEC_VALUE_LENGTH,
  specLabelKey,
  specValueKey,
} from "@/lib/specs/keys";

/**
 * Variant parsing shared by the admin form and the product actions.
 *
 * The form posts a grid: a list of axis labels, then one row per variant
 * carrying a value for each axis plus its own price, stock and SKU. Values
 * arrive under a single repeated `variantValue` field in row-major order, so
 * they are re-split by the axis count rather than by index-aligned arrays —
 * a ragged row would otherwise silently shift every value after it.
 */

export interface VariantAxisInput {
  label: string;
  labelKey: string;
}

export interface VariantInput {
  sku: string | null;
  priceCents: number;
  /** What this configuration used to cost. Null means it is not on sale. */
  compareAtPriceCents: number | null;
  stock: number;
  /** One per axis, in the same order the axes were submitted. */
  values: { value: string; valueKey: string }[];
}

export interface VariantParseResult {
  axes: VariantAxisInput[];
  variants: VariantInput[];
  error?: string;
}

export function parseVariants(formData: FormData): VariantParseResult {
  const empty: VariantParseResult = { axes: [], variants: [] };

  const axisLabels = formData
    .getAll("variantAxis")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const axes: VariantAxisInput[] = [];
  const seenAxes = new Set<string>();

  for (const label of axisLabels) {
    if (label.length > MAX_SPEC_LABEL_LENGTH) {
      return { ...empty, error: `Axis labels must be ${MAX_SPEC_LABEL_LENGTH} characters or fewer` };
    }
    const labelKey = specLabelKey(label);
    if (!labelKey) {
      return { ...empty, error: `“${label}” needs at least one letter or number` };
    }
    if (seenAxes.has(labelKey)) {
      return { ...empty, error: `“${label}” is listed twice as an axis` };
    }
    seenAxes.add(labelKey);
    axes.push({ label, labelKey });
  }

  const prices = formData.getAll("variantPrice").map((v) => String(v).trim());
  const compareAts = formData.getAll("variantCompareAt").map((v) => String(v).trim());
  const stocks = formData.getAll("variantStock").map((v) => String(v).trim());
  const skus = formData.getAll("variantSku").map((v) => String(v).trim());
  const values = formData.getAll("variantValue").map((v) => String(v).trim());

  const rowCount = Math.max(prices.length, stocks.length, skus.length);

  // No axes means no variants, whatever else was posted — a configuration
  // with nothing to configure is just the product.
  if (axes.length === 0 || rowCount === 0) return empty;

  if (values.length !== rowCount * axes.length) {
    return { ...empty, error: "Variant grid is inconsistent — reload and try again" };
  }

  const variants: VariantInput[] = [];
  const seenCombinations = new Set<string>();
  const seenSkus = new Set<string>();

  for (let row = 0; row < rowCount; row++) {
    const rowValues = values.slice(row * axes.length, (row + 1) * axes.length);
    const price = prices[row] ?? "";
    const compareAt = compareAts[row] ?? "";
    const stock = stocks[row] ?? "";
    const sku = skus[row] ?? "";

    // A wholly blank row is how the form offers "add another", so it is
    // dropped rather than rejected. A "was" price alone does not make a row
    // real — there would be nothing to discount.
    if (rowValues.every((value) => !value) && !price && !stock && !sku) continue;

    const missing = rowValues.findIndex((value) => !value);
    if (missing >= 0) {
      return { ...empty, error: `Every variant needs a ${axes[missing].label}` };
    }
    if (rowValues.some((value) => value.length > MAX_SPEC_VALUE_LENGTH)) {
      return { ...empty, error: `Variant values must be ${MAX_SPEC_VALUE_LENGTH} characters or fewer` };
    }

    const keys = rowValues.map(specValueKey);
    if (keys.some((key) => !key)) {
      return { ...empty, error: "Every variant value needs a letter or number" };
    }

    // The schema has a unique on (variantId, definitionId); two rows with the
    // same combination would be two ways to buy the same thing.
    const combination = keys.join("|");
    if (seenCombinations.has(combination)) {
      return { ...empty, error: `${rowValues.join(" / ")} is listed twice` };
    }
    seenCombinations.add(combination);

    const priceNumber = Number(price);
    if (!price) {
      return { ...empty, error: `Enter a price for ${rowValues.join(" / ")}` };
    }
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      return { ...empty, error: `Enter a valid price for ${rowValues.join(" / ")}` };
    }
    if (priceNumber > 1_000_000) {
      return { ...empty, error: `The price for ${rowValues.join(" / ")} is unrealistically high` };
    }

    const priceCents = Math.round(priceNumber * 100);

    // Judged by the same rule as the product's own "was" price, so a
    // configuration cannot be stored in a state the storefront would decline
    // to render as a sale.
    const compareAtCents = compareAt ? Math.round(Number(compareAt) * 100) : null;
    if (compareAt && !Number.isFinite(Number(compareAt))) {
      return { ...empty, error: `Enter a valid “was” price for ${rowValues.join(" / ")}` };
    }
    const compareAtProblem = compareAtError(priceCents, compareAtCents);
    if (compareAtProblem) {
      return { ...empty, error: `${compareAtProblem} for ${rowValues.join(" / ")}` };
    }

    const stockNumber = Number(stock || "0");
    if (!Number.isInteger(stockNumber) || stockNumber < 0) {
      return { ...empty, error: `Stock for ${rowValues.join(" / ")} must be a whole number` };
    }

    if (sku) {
      const normalized = sku.toLowerCase();
      if (seenSkus.has(normalized)) {
        return { ...empty, error: `SKU “${sku}” is used twice` };
      }
      seenSkus.add(normalized);
    }

    variants.push({
      sku: sku || null,
      priceCents,
      compareAtPriceCents: compareAtCents,
      stock: stockNumber,
      values: rowValues.map((value, index) => ({ value, valueKey: keys[index] })),
    });
  }

  if (variants.length > MAX_VARIANTS) {
    return { ...empty, error: `At most ${MAX_VARIANTS} variants` };
  }

  return { axes, variants };
}
