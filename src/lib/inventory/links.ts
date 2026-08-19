/**
 * Where a line's history lives, as a URL.
 *
 * One function rather than string-building at each call site, because three
 * screens link into the history page and a second spelling of the params is
 * how one of them stops matching the page's parser.
 */
export function historyHref(options: {
  productId: string;
  /** A variant's id for one configuration, null for the product's own row,
   *  undefined for every line of the product. */
  variantId?: string | null;
  kind?: "stock" | "price";
}): string {
  const query = new URLSearchParams();
  query.set("product", options.productId);
  if (options.variantId === null) query.set("variant", "none");
  else if (options.variantId) query.set("variant", options.variantId);
  if (options.kind === "price") query.set("kind", "price");
  return `/admin/inventory/history?${query.toString()}`;
}

/** The inverse of `historyHref`'s `variant` param. */
export function parseVariantParam(value: string | undefined): string | null | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "none") return null;
  return value;
}
