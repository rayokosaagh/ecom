"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ProductSuggestion,
  SearchResponse,
} from "@/lib/products/search-text";

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 150;

/** Below this, the query matches too much to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

/** Shared empty result, so "no search running" is referentially stable. */
const EMPTY_RESULTS: ProductSuggestion[] = [];

export interface UseProductSearchOptions {
  /** Current input value. */
  query: string;
  /** Suspend fetching while the field is collapsed or hidden. */
  enabled?: boolean;
  limit?: number;
  /**
   * What "search for exactly what I typed" means here. Defaults to a plain
   * `/products?q=` push; the catalogue toolbar overrides it so submitting keeps
   * the price, stock and category filters already in the URL.
   */
  onSubmit?: (query: string) => void;
}

export interface ProductSearchState {
  results: ProductSuggestion[];
  loading: boolean;
  /** Whether the dropdown should be on screen. */
  open: boolean;
  /** Index into `results`, or -1 when the raw query itself is highlighted. */
  activeIndex: number;
  /** Lets pointer hover move the highlight in step with the keyboard. */
  setActiveIndex: (index: number) => void;
  listboxId: string;
  activeOptionId: string | undefined;
  /** Attach to the input; drives arrow keys, Enter and Escape. */
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Navigate to a suggestion. */
  goToProduct: (product: ProductSuggestion) => void;
  /** Submit the raw query to the catalogue. */
  submitQuery: (value?: string) => void;
  /** Force the dropdown shut without clearing the field. */
  dismiss: () => void;
}

/**
 * Debounced product typeahead against `/api/search`.
 *
 * Shared by the navbar and the catalogue toolbar so the two search bars cannot
 * drift apart in behaviour. Owns the request lifecycle (debounce, abort,
 * out-of-order protection) and the roving highlight; the caller owns the input
 * value and renders the panel.
 */
export function useProductSearch({
  query,
  enabled = true,
  limit = 6,
  onSubmit,
}: UseProductSearchOptions): ProductSearchState {
  const router = useRouter();

  // Raw fetch state. What the caller sees is derived from these below, so a
  // disabled field reports "no results" without an effect having to clear them.
  const [fetched, setFetched] = useState<ProductSuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  // Stable per instance and identical on server and client, so two search bars
  // on one page cannot collide and hydration stays quiet.
  const listboxId = `product-search-${useId()}`;

  const trimmed = query.trim();
  const shouldSearch = enabled && trimmed.length >= MIN_QUERY_LENGTH;

  // A new query means the old highlight is meaningless.
  const [lastQuery, setLastQuery] = useState(trimmed);
  if (lastQuery !== trimmed) {
    setLastQuery(trimmed);
    setActiveIndex(-1);
    setDismissed(false);
  }

  useEffect(() => {
    if (!shouldSearch) return;

    // Abort rather than ignore: a superseded request should stop occupying a
    // connection, and aborting guarantees its response can never win a race.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
        const response = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const data: SearchResponse = await response.json();
        setFetched(data.results);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        // A failed suggestion lookup is not worth interrupting anyone over —
        // the field still submits to the catalogue on Enter.
        setFetched([]);
      } finally {
        // The abort path deliberately stays pending: a replacement request is
        // already on its way, and dropping the flag here would flicker the row.
        if (!controller.signal.aborted) setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, shouldSearch, limit]);

  // Previous results stay on screen while the next request is in flight, which
  // keeps the panel from flashing empty between keystrokes.
  // Memoised so the empty-array branch keeps a stable identity — `onKeyDown`
  // closes over this and would otherwise be rebuilt on every render.
  const results = useMemo(
    () => (shouldSearch ? fetched : EMPTY_RESULTS),
    [shouldSearch, fetched],
  );
  const loading = shouldSearch && pending;
  const open = shouldSearch && !dismissed && (results.length > 0 || loading);

  // Keep the latest callback out of the memo deps: consumers commonly pass an
  // inline closure over their own state, which would otherwise rebuild every
  // handler on each keystroke.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const submitQuery = useCallback(
    (value?: string) => {
      const target = (value ?? query).trim();
      if (!target) return;
      setDismissed(true);

      if (onSubmitRef.current) onSubmitRef.current(target);
      else router.push(`/products?q=${encodeURIComponent(target)}`);
    },
    [query, router],
  );

  const goToProduct = useCallback(
    (product: ProductSuggestion) => {
      setDismissed(true);
      router.push(`/products/${product.slug}`);
    },
    [router],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setDismissed(true);
        return;
      }

      if (event.key === "Enter") {
        const active = results[activeIndex];
        if (active) {
          event.preventDefault();
          goToProduct(active);
          return;
        }

        // Nothing to search for. Leave the event alone so an enclosing form
        // still submits — that is how the catalogue toolbar clears `?q=`.
        if (!query.trim()) return;

        event.preventDefault();
        submitQuery();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (!open || results.length === 0) return;

      // Stop the caret jumping to either end of the input.
      event.preventDefault();

      // -1 is a real position (the typed query), so the cycle runs
      // -1 → 0 → … → last → -1.
      const span = results.length + 1;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(((activeIndex + 1 + step + span) % span) - 1);
    },
    [activeIndex, goToProduct, open, query, results, submitQuery],
  );

  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    results,
    loading,
    open,
    activeIndex,
    setActiveIndex,
    listboxId,
    activeOptionId:
      activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined,
    onKeyDown,
    goToProduct,
    submitQuery,
    dismiss,
  };
}
