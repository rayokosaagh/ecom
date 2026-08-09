"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";

import { Icon } from "@/components/ui/Icon";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { useProductSearch } from "@/lib/hooks/useProductSearch";
import { cn } from "@/lib/cn";

export interface FilterValues {
  q: string;
  sort: string;
  min: string;
  max: string;
  inStock: boolean;
  /** Reduced products only — see the note in `app/products/page`. */
  onSale: boolean;
  /** Preserved across filter changes, owned by the category pills. */
  category: string;
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
  { value: "rating", label: "Top rated" },
] as const;

/** Only meaningful while a search is active, so it is offered conditionally. */
const RELEVANCE_OPTION = { value: "relevance", label: "Relevance" } as const;

/**
 * Search + filter toolbar for the catalogue.
 *
 * Everything lives in the URL, so results are shareable and the back button
 * works: the component just rewrites query params and lets the server
 * component re-query. Sort and stock apply instantly; text inputs apply on
 * Enter or via the Apply button.
 */
export function ProductFilters({ initial }: { initial: FilterValues }) {
  const router = useRouter();
  /**
   * Read for one reason: `apply` builds the next URL from scratch, so anything
   * it does not re-add is dropped. Spec selections are owned by the sidebar and
   * never appear in this toolbar's state, so before this they vanished the
   * moment a shopper changed the sort, pressed Apply, or toggled a chip —
   * narrowing to "RAM: 16 GB" and then sorting by price silently widened the
   * results back out.
   *
   * They are passed through opaquely: this component has no business knowing
   * what a spec param means, only that it is not its to discard.
   */
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState(initial.sort);
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);
  const [inStock, setInStock] = useState(initial.inStock);
  const [onSale, setOnSale] = useState(initial.onSale);

  const apply = (overrides: Partial<FilterValues> = {}) => {
    const next = {
      q,
      sort,
      min,
      max,
      inStock,
      onSale,
      category: initial.category,
      ...overrides,
    };

    const trimmedQuery = next.q.trim();
    // Relevance is already the server's default for a search, and is invalid
    // without one — either way it does not belong in the URL.
    const explicitSort =
      next.sort === RELEVANCE_OPTION.value || next.sort === "newest"
        ? ""
        : next.sort;

    const params = new URLSearchParams();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (next.category) params.set("category", next.category);
    if (explicitSort) params.set("sort", explicitSort);
    if (next.min) params.set("min", next.min);
    if (next.max) params.set("max", next.max);
    if (next.inStock) params.set("stock", "in");
    if (next.onSale) params.set("sale", "1");

    // `append`, not `set`: a label can carry several selected values, the same
    // way the server's `facetHref` re-emits them.
    for (const spec of searchParams.getAll("spec")) params.append("spec", spec);

    const query = params.toString();
    router.push(query ? `/products?${query}` : "/products");
  };

  // Submitting from here keeps the other filters, so it goes through `apply`
  // rather than the hook's default `/products?q=` push.
  const search = useProductSearch({
    query: q,
    onSubmit: (value) => apply({ q: value }),
  });

  const searchRef = useDismissable<HTMLDivElement>(search.open, search.dismiss);

  // Ranking needs something to rank, so Relevance appears only once the URL
  // carries a query — matching what the server will actually accept.
  const sortOptions = initial.q
    ? [RELEVANCE_OPTION, ...SORT_OPTIONS]
    : [...SORT_OPTIONS];

  const hasActiveFilters =
    Boolean(initial.q || initial.min || initial.max || initial.category) ||
    initial.inStock ||
    initial.onSale ||
    // Counted too, so a view narrowed only by the spec sidebar still offers a
    // way out — Clear goes to a bare /products, which drops these with it.
    searchParams.getAll("spec").length > 0 ||
    initial.sort !== "newest";

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {/* Search */}
      <div ref={searchRef} className="relative flex h-11 min-w-0 flex-1 basis-64">
        <div className="bg-surface-container-high focus-within:ring-primary relative flex size-full items-center rounded-full transition-shadow duration-200 focus-within:ring-2">
          <Icon
            name="search"
            size={20}
            className="text-on-surface-variant pointer-events-none absolute left-4"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={search.open}
            aria-controls={search.listboxId}
            aria-activedescendant={search.activeOptionId}
            // The hook owns Enter so a highlighted suggestion wins over the
            // form's own submit handler.
            onKeyDown={search.onKeyDown}
            className="text-on-surface placeholder:text-on-surface-variant size-full min-w-0 bg-transparent pr-4 pl-11 text-sm outline-none"
          />
        </div>

        <AnimatePresence>
          {search.open && (
            <SearchSuggestions
              id={search.listboxId}
              results={search.results}
              loading={search.loading}
              query={q}
              activeIndex={search.activeIndex}
              onSelect={search.goToProduct}
              onSubmitQuery={search.submitQuery}
              onHoverIndex={search.setActiveIndex}
              align="left"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Sort — applies immediately */}
      <label className="bg-surface-container-high relative flex h-11 items-center rounded-full">
        <span className="sr-only">Sort by</span>
        <Icon
          name="swap_vert"
          size={20}
          className="text-on-surface-variant pointer-events-none absolute left-3.5"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            apply({ sort: e.target.value });
          }}
          className="text-on-surface h-full appearance-none rounded-full bg-transparent pr-9 pl-10 text-sm outline-none focus-visible:ring-2"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="expand_more"
          size={18}
          className="text-on-surface-variant pointer-events-none absolute right-3"
        />
      </label>

      {/* Price range */}
      <div className="bg-surface-container-high flex h-11 items-center gap-1 rounded-full px-4">
        <Icon name="attach_money" size={18} className="text-on-surface-variant" />
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Min"
          aria-label="Minimum price"
          className="text-on-surface placeholder:text-on-surface-variant w-16 bg-transparent text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span aria-hidden className="text-on-surface-variant text-sm">
          –
        </span>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="Max"
          aria-label="Maximum price"
          className="text-on-surface placeholder:text-on-surface-variant w-16 bg-transparent text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>

      {/* In stock — M3 filter chip, applies immediately */}
      <button
        type="button"
        role="switch"
        aria-checked={inStock}
        onClick={() => {
          setInStock(!inStock);
          apply({ inStock: !inStock });
        }}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
          "transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          inStock
            ? "bg-secondary-container text-on-secondary-container border-transparent"
            : "border-outline text-on-surface-variant",
        )}
      >
        <Icon name={inStock ? "check" : "package_2"} size={18} />
        In stock
      </button>

      {/* On sale — same chip, applies immediately. Tertiary rather than the
          secondary container the stock chip uses, because green is what a
          discount is everywhere else in this app. */}
      <button
        type="button"
        role="switch"
        aria-checked={onSale}
        onClick={() => {
          setOnSale(!onSale);
          apply({ onSale: !onSale });
        }}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
          "transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          onSale
            ? "bg-tertiary-container text-on-tertiary-container border-transparent"
            : "border-outline text-on-surface-variant",
        )}
      >
        <Icon name={onSale ? "check" : "sell"} size={18} />
        On sale
      </button>

      <button
        type="submit"
        className="bg-primary text-on-primary state-layer h-11 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
      >
        Apply
      </button>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="text-primary state-layer flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="filter_alt_off" size={18} />
          Clear
        </button>
      )}
    </form>
  );
}
