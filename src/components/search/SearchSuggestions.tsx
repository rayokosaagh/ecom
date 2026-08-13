"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { NO_MOTION, PANEL_TRANSITION } from "@/lib/motion";
import { formatPrice } from "@/lib/products/format";
import { tokenize, type ProductSuggestion } from "@/lib/products/search-text";

export interface SearchSuggestionsProps {
  id: string;
  results: ProductSuggestion[];
  loading: boolean;
  /** Raw input value — echoed in the "see all" row and used for highlighting. */
  query: string;
  activeIndex: number;
  onSelect: (product: ProductSuggestion) => void;
  onSubmitQuery: () => void;
  onHoverIndex?: (index: number) => void;
  /**
   * Which edge the panel hangs from. A prop rather than a className override
   * because `cn` is a plain joiner — two competing `left-*`/`right-*` classes
   * would resolve by stylesheet order, not by who passed them.
   */
  align?: "left" | "right";
  className?: string;
  reduceMotion?: boolean;
}

/**
 * Splits `text` on the searched tokens so matches can be marked.
 *
 * Matching happens on a normalised copy but the offsets are applied to the
 * original string, so accents and capitalisation survive the round trip.
 */
function splitOnMatches(text: string, tokens: string[]): Array<[string, boolean]> {
  if (tokens.length === 0) return [[text, false]];

  const haystack = text.toLowerCase();
  const hits: Array<[number, number]> = [];

  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(token, from);
      if (at === -1) break;
      hits.push([at, at + token.length]);
      from = at + token.length;
    }
  }

  if (hits.length === 0) return [[text, false]];

  // Merge overlaps so nested <mark> elements cannot happen.
  hits.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [hits[0]];
  for (const [start, end] of hits.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const parts: Array<[string, boolean]> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push([text.slice(cursor, start), false]);
    parts.push([text.slice(start, end), true]);
    cursor = end;
  }
  if (cursor < text.length) parts.push([text.slice(cursor), false]);

  return parts;
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {splitOnMatches(text, tokens).map(([chunk, matched], index) => (
        <Fragment key={index}>
          {matched ? (
            <mark className="bg-transparent font-semibold text-inherit">{chunk}</mark>
          ) : (
            chunk
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Autocomplete panel for the product search bars.
 *
 * Purely presentational — `useProductSearch` owns the data and the highlight.
 * Rows commit on `mousedown` rather than `click` because the input's `blur`
 * handler collapses the field, and blur would otherwise fire first and unmount
 * the row out from under the click.
 */
export function SearchSuggestions({
  id,
  results,
  loading,
  query,
  activeIndex,
  onSelect,
  onSubmitQuery,
  onHoverIndex,
  align = "right",
  className,
  reduceMotion = false,
}: SearchSuggestionsProps) {
  const tokens = tokenize(query);
  const trimmed = query.trim();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4 }}
      transition={reduceMotion ? NO_MOTION : PANEL_TRANSITION}
      className={cn(
        "bg-surface-container-high shadow-elevation-2 absolute top-full z-50 mt-2",
        align === "right" ? "right-0" : "left-0",
        "w-[min(24rem,calc(100vw-1.5rem))] origin-top overflow-hidden rounded-xl",
        className,
      )}
    >
      {results.length === 0 ? (
        <p className="text-on-surface-variant px-4 py-6 text-center text-sm">
          {loading ? "Searching…" : `No matches for “${trimmed}”`}
        </p>
      ) : (
        <ul id={id} role="listbox" aria-label="Product suggestions" className="max-h-96 overflow-y-auto py-1">
          {results.map((product, index) => {
            const active = index === activeIndex;
            const soldOut = product.stock === 0;

            return (
              <li
                key={product.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(product);
                }}
                onMouseEnter={() => onHoverIndex?.(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-150",
                  active ? "bg-on-surface/[0.08]" : "hover:bg-on-surface/[0.06]",
                )}
              >
                {/* Thumbnail. Plain <img> to match ProductCard: these URLs are
                    operator-supplied and can point at any host. */}
                <span className="bg-surface-container-highest relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg">
                  {product.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon name="image" size={20} className="text-on-surface-variant" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-on-surface block truncate text-sm">
                    <Highlight text={product.name} tokens={tokens} />
                  </span>
                  <span className="text-on-surface-variant block truncate text-xs">
                    {product.categoryName ?? "Uncategorised"}
                  </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-on-surface text-sm">
                    {formatPrice(product.priceCents)}
                  </span>
                  {soldOut && (
                    <span className="text-on-surface-variant text-label-sm">Sold out</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {trimmed && (
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSubmitQuery();
          }}
          className={cn(
            "border-outline-variant text-primary flex w-full items-center gap-2 border-t px-4 py-3 text-sm font-medium",
            "hover:bg-on-surface/[0.06] transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:-outline-offset-2",
            activeIndex === -1 && results.length > 0 && "bg-on-surface/[0.04]",
          )}
        >
          <Icon name="search" size={18} />
          <span className="truncate">See all results for “{trimmed}”</span>
        </button>
      )}
    </motion.div>
  );
}
