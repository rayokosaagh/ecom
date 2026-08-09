"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Wait this long after the last keystroke before rewriting the URL. */
const DEBOUNCE_MS = 250;

export interface ListFilter {
  /** Query-string key this control owns. */
  param: string;
  label: string;
  /** The empty value is supplied by the toolbar as "Any". */
  options: { value: string; label: string }[];
}

/**
 * Search box and filter controls for an admin list.
 *
 * State lives in the URL rather than in this component, which is what makes the
 * server do the filtering: it rewrites query params and the page — a server
 * component — re-queries. A filtered view is then a link like any other, so it
 * survives a reload, sits in a bookmark, and can be pasted to someone else.
 *
 * Params it was not given are preserved rather than rebuilt, so a control added
 * to one page cannot silently drop another page's.
 */
export function ListToolbar({
  searchLabel,
  filters = [],
  alsoClear = [],
  /** Rendered on the right — usually the "Add …" button. */
  action,
  className,
}: {
  searchLabel: string;
  filters?: ListFilter[];
  /**
   * Params driven by controls outside this toolbar — the pill rails — that
   * Clear should nonetheless reset. Without them "Clear" wipes the search and
   * the dropdowns while quietly leaving a status pill on, and the list stays
   * narrowed for no visible reason.
   */
  alsoClear?: string[];
  action?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);

  // Re-sync when the URL changes from outside this field — the Clear button,
  // the back button, or a link. Guarded on the *URL* value so it cannot fight
  // the visitor mid-type: while typing, `urlQuery` is still the old value and
  // this does not run until the debounce lands.
  const lastPushed = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  const commit = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    const search = params.toString();
    startTransition(() => {
      // `replace`, not `push`: typing four characters would otherwise leave
      // four entries in the history and the back button would crawl backwards
      // through them one letter at a time.
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  };

  // Debounced so a query runs per pause, not per keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === lastPushed.current) return;

    const id = window.setTimeout(() => {
      lastPushed.current = trimmed;
      commit({ q: trimmed });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // `commit` closes over the current params, and is deliberately not a dep:
    // re-running this on every param change would re-push the same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const owned = [...filters.map((filter) => filter.param), ...alsoClear];
  const active = urlQuery.length > 0 || owned.some((param) => searchParams.get(param));

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Icon
            name="search"
            size={20}
            className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Enter would submit an enclosing form and reload the page; the
            // debounce has already applied the query by then anyway.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
              if (event.key === "Escape") setQuery("");
            }}
            aria-label={searchLabel}
            placeholder={searchLabel}
            className={cn(
              "border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary",
              "h-11 w-full rounded-full border bg-transparent pr-10 pl-11 text-sm outline-none",
              "transition-colors duration-200",
              // The native clear affordance is a tiny grey cross that ignores
              // the theme; this field has its own.
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />

          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-on-surface-variant hover:bg-on-surface/[0.08] absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full transition-colors duration-200"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>

        {action}
      </div>

      {(filters.length > 0 || active) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const value = searchParams.get(filter.param) ?? "";
            return (
              <label key={filter.param} className="relative">
                <span className="sr-only">{filter.label}</span>
                <select
                  value={value}
                  onChange={(event) => commit({ [filter.param]: event.target.value })}
                  className={cn(
                    "h-9 appearance-none rounded-full border py-0 pr-9 pl-4 text-sm outline-none",
                    "transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
                    value
                      ? "border-secondary-container bg-secondary-container text-on-secondary-container"
                      : "border-outline text-on-surface-variant",
                  )}
                >
                  <option value="">{filter.label}: any</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon
                  name="expand_more"
                  size={18}
                  className={cn(
                    "pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2",
                    value ? "text-on-secondary-container" : "text-on-surface-variant",
                  )}
                />
              </label>
            );
          })}

          {active && (
            <button
              type="button"
              onClick={() =>
                commit({ q: "", ...Object.fromEntries(owned.map((p) => [p, ""])) })
              }
              className="text-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="filter_alt_off" size={18} />
              Clear
            </button>
          )}

          {/* Reserves its own space so the row does not reflow as it appears. */}
          <span
            aria-hidden
            className={cn(
              "text-on-surface-variant text-xs transition-opacity duration-200",
              isPending ? "opacity-100" : "opacity-0",
            )}
          >
            Filtering…
          </span>
        </div>
      )}
    </div>
  );
}
