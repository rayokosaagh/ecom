"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface FilterCategory {
  id: string;
  name: string;
  slug: string;
  /**
   * Built on the server, because a function cannot cross the server/client
   * boundary — and the href depends on every other active filter, which only
   * the page knows about.
   */
  href: string;
  children: FilterCategory[];
}

/**
 * Category facet as a set of top-level pills that reveal their subcategories.
 *
 * A flat list of every node put nine pills in a row and gave no clue which
 * belonged to which. Here only the parents show by default; a parent with
 * children reveals them on hover or on click of its caret, so the tree is
 * discoverable without permanently spending the space.
 *
 * The pill itself stays a plain link, because selecting a parent is a real
 * filter — it returns everything in the subtree.
 */
export function CategoryFilter({
  categories,
  active,
  allHref,
}: {
  categories: FilterCategory[];
  /** Slug of the selected category, or "" for All. */
  active: string;
  /** Destination for the "All" pill. */
  allHref: string;
}) {
  // Open the branch containing the current selection, so a subcategory filter
  // does not look like it came from nowhere.
  const initial = categories.find(
    (c) => c.slug === active || c.children.some((child) => child.slug === active),
  );
  const [expanded, setExpanded] = useState<string | null>(initial?.id ?? null);

  if (categories.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={allHref}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            !active
              ? "bg-secondary-container text-on-secondary-container"
              : "text-on-surface-variant hover:bg-on-surface/[0.06]",
          )}
        >
          All
        </Link>

        {categories.map((category) => {
          const hasChildren = category.children.length > 0;
          const isOpen = expanded === category.id;
          // A parent counts as selected when one of its children is, so the
          // trail back to the top stays visible.
          const inBranch =
            category.slug === active ||
            category.children.some((child) => child.slug === active);

          return (
            <div
              key={category.id}
              onMouseEnter={() => hasChildren && setExpanded(category.id)}
              className={cn(
                "flex items-center rounded-full transition-colors duration-200",
                inBranch
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-on-surface/[0.06]",
              )}
            >
              <Link
                href={category.href}
                className={cn(
                  "rounded-full py-2 pl-4 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2",
                  hasChildren ? "pr-1" : "pr-4",
                )}
              >
                {category.name}
              </Link>

              {hasChildren && (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} ${category.name} subcategories`}
                  onClick={() => setExpanded(isOpen ? null : category.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-200 focus-visible:outline-2"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                >
                  <Icon name="expand_more" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Revealed subcategories sit on their own row, so opening one never
          reflows the parent pills. */}
      {expanded && (
        <div
          onMouseEnter={() => setExpanded(expanded)}
          className="border-outline-variant flex flex-wrap items-center gap-2 border-l-2 pl-3"
        >
          {categories
            .find((c) => c.id === expanded)
            ?.children.map((child) => (
              <Link
                key={child.id}
                href={child.href}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  child.slug === active
                    ? "bg-secondary-container text-on-secondary-container border-transparent"
                    : "border-outline-variant text-on-surface-variant hover:bg-on-surface/[0.06]",
                )}
              >
                {child.name}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
