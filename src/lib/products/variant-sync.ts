/**
 * Reconciling the variants a product form posted with the ones it has.
 *
 * Pure — no Prisma import — so `updateProduct` and `check:variant-sync` judge
 * the same posted grid the same way. The action is the boundary that matters;
 * this being separate is what lets the matching rules be asserted without a
 * database.
 *
 * Why variants are diffed rather than replaced, when colours and specs are
 * replaced wholesale without harm: a variant's id is what its stock ledger,
 * its price ledger and every order line that took units from it point at.
 * Recreating the rows on each save would cascade both ledgers away and leave a
 * cancelled order's restock matching an id that no longer exists — units that
 * silently never come back. So each posted row is recognised as the variant
 * it already is, and only genuinely new configurations get new ids.
 */

/** One option of a configuration, as the form resolved it. */
export interface VariantOptionRow {
  definitionId: string;
  value: string;
  valueKey: string;
}

/** One configuration as the form described it, with its axes resolved. */
export interface VariantRow {
  /** The stored variant this row is, or null for one being added. */
  id: string | null;
  sku: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  sortOrder: number;
  options: VariantOptionRow[];
}

/** What is needed of a stored variant to recognise it. */
export interface ExistingVariant {
  id: string;
  options: { definitionId: string; valueKey: string }[];
}

export interface VariantSyncPlan {
  /** Stored variants the form still lists, with what to write over them. */
  updated: { id: string; row: VariantRow }[];
  /** Configurations the product did not have before. */
  created: VariantRow[];
  /** Stored variants the form no longer lists. */
  removed: string[];
}

/**
 * What a configuration *is*, independent of its row: one value per axis.
 *
 * Order-insensitive, so a grid whose axes were reordered still describes the
 * same configurations.
 */
export function variantSignature(
  options: { definitionId: string; valueKey: string }[],
): string {
  return options
    .map((option) => `${option.definitionId}=${option.valueKey}`)
    .sort()
    .join("|");
}

/**
 * Match posted rows to stored variants.
 *
 * By id first: the form carries each stored variant's id, and an id survives
 * the admin renaming a value ("512GB" → "512 GB"), which a signature would
 * not. By configuration as the fallback: a row removed and re-added in the
 * same edit, or a grid posted from a form that did not carry ids, still finds
 * the variant it is rather than starting a new one.
 *
 * Only ids in `existing` are honoured. The caller passes this product's
 * variants alone, so an id from a stale or tampered form cannot reach into
 * another product's rows. Each stored variant is claimed at most once; a
 * second row pointing at the same one becomes a creation, which the SKU and
 * combination uniqueness then judge as they would any new row.
 */
export function planVariantSync(
  existing: ExistingVariant[],
  posted: VariantRow[],
): VariantSyncPlan {
  const ids = new Set(existing.map((variant) => variant.id));
  const bySignature = new Map(
    existing.map((variant) => [variantSignature(variant.options), variant.id]),
  );

  const claimed = new Set<string>();
  const updated: VariantSyncPlan["updated"] = [];
  const created: VariantRow[] = [];

  for (const row of posted) {
    let match = row.id && ids.has(row.id) && !claimed.has(row.id) ? row.id : null;
    if (!match) {
      const candidate = bySignature.get(variantSignature(row.options));
      if (candidate && !claimed.has(candidate)) match = candidate;
    }
    if (match) {
      claimed.add(match);
      updated.push({ id: match, row });
    } else {
      created.push(row);
    }
  }

  const removed = existing
    .map((variant) => variant.id)
    .filter((variantId) => !claimed.has(variantId));

  return { updated, created, removed };
}
