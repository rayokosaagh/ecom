"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface SpecFilterOption {
  valueKey: string;
  label: string;
  count: number;
  selected: boolean;
  /** Resolved on the server — toggling this option, keeping every other filter. */
  href: string;
}

export interface SpecFilterGroup {
  key: string;
  label: string;
  icon: string;
  options: SpecFilterOption[];
  /** Clears this label entirely. Null when nothing in it is selected. */
  clearHref: string | null;
}

/** Labels open on arrival. Past this they are one line each until asked for. */
const OPEN_BY_DEFAULT = 3;

/** How many options a label shows before collapsing the rest behind a toggle. */
const VISIBLE_OPTIONS = 6;

/**
 * Spec facets as a sidebar.
 *
 * The hard part here is not styling, it is volume: a mixed catalogue can offer
 * a dozen labels with several values each, and rendering them all expanded is
 * a wall nobody reads. Two things keep it legible — the server only sends
 * labels that describe a real share of the current view (see MIN_COVERAGE in
 * lib/specs/facets), and everything past the first few arrives collapsed to a
 * single row.
 *
 * Every option is a real `<Link>` whose href was resolved on the server with
 * the rest of the active filters folded in, so the whole thing works without
 * JavaScript and is shareable. The only client state is presentational: which
 * sections are open.
 */
export function SpecSidebar({
  groups,
  scope,
  clearAllHref,
  activeCount,
}: {
  groups: SpecFilterGroup[];
  /**
   * Category these filters are scoped to, named in the heading. Spec values
   * are only comparable within one, so saying which makes the scope visible
   * rather than something the shopper has to infer.
   */
  scope: string | null;
  /** Clears every spec selection. Null when none is active. */
  clearAllHref: string | null;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  return (
    <aside aria-labelledby="spec-filters-heading" className="lg:w-64 lg:shrink-0">
      {/* Collapsed by default on mobile: the grid is what the page is for, and
          a stack of filters would bury it. Always open from lg up, where the
          column costs nothing the results were using. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="spec-filters"
        className="border-outline text-on-surface flex h-11 w-full items-center justify-between gap-2 rounded-full border px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
      >
        <span className="flex items-center gap-2">
          <Icon name="tune" size={18} />
          {scope ? `Refine ${scope}` : "Specifications"}
          {activeCount > 0 && (
            <span className="bg-primary text-on-primary grid size-5 place-items-center rounded-full text-xs">
              {activeCount}
            </span>
          )}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} />
      </button>

      <div
        id="spec-filters"
        className={cn("mt-4 lg:mt-0 lg:block", open ? "block" : "hidden")}
      >
        <div className="mb-2 hidden items-center justify-between gap-2 px-1 lg:flex">
          <h2
            id="spec-filters-heading"
            className="text-on-surface-variant min-w-0 truncate text-xs font-medium tracking-[0.15em] uppercase"
          >
            {scope ? `Refine ${scope}` : "Refine"}
          </h2>
          {clearAllHref && (
            <Link
              href={clearAllHref}
              className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Clear all
            </Link>
          )}
        </div>

        <div className="divide-outline-variant border-outline-variant divide-y rounded-xl border">
          {groups.map((group, index) => (
            <SpecGroup
              key={group.key}
              group={group}
              defaultOpen={index < OPEN_BY_DEFAULT}
            />
          ))}
        </div>

        {clearAllHref && (
          <Link
            href={clearAllHref}
            className="border-outline text-on-surface-variant mt-4 flex h-10 items-center justify-center rounded-full border text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
          >
            Clear all filters
          </Link>
        )}
      </div>
    </aside>
  );
}

function SpecGroup({
  group,
  defaultOpen,
}: {
  group: SpecFilterGroup;
  defaultOpen: boolean;
}) {
  const selectedCount = group.options.filter((option) => option.selected).length;

  // A label the shopper is already filtering by opens regardless of position:
  // a live filter hidden behind a collapsed row reads as no filter at all.
  const [open, setOpen] = useState(defaultOpen || selectedCount > 0);
  const [expanded, setExpanded] = useState(false);

  const hasHiddenSelection = group.options
    .slice(VISIBLE_OPTIONS)
    .some((option) => option.selected);

  const showAll = expanded || hasHiddenSelection;
  const visible = showAll ? group.options : group.options.slice(0, VISIBLE_OPTIONS);
  const hiddenCount = group.options.length - visible.length;

  const panelId = `spec-${group.key}`;

  return (
    <section>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="text-on-surface hover:bg-on-surface/[0.04] flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <Icon
            name={group.icon}
            size={18}
            className={selectedCount > 0 ? "text-primary" : "text-on-surface-variant"}
          />
          <span className="min-w-0 flex-1 truncate">{group.label}</span>

          {/* The count of *selections* rather than options: what matters at a
              glance on a collapsed row is whether this label is doing
              anything. */}
          {selectedCount > 0 && (
            <span className="bg-primary text-on-primary grid size-5 shrink-0 place-items-center rounded-full text-[11px]">
              {selectedCount}
            </span>
          )}

          <Icon
            name="expand_more"
            size={18}
            className={cn(
              "text-on-surface-variant shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>

      {open && (
        <div id={panelId} className="px-1.5 pb-2">
          <ul className="space-y-0.5">
            {visible.map((option) => (
              <li key={option.valueKey}>
                <Link
                  href={option.href}
                  // A link that toggles a filter is a control, not a
                  // destination — `aria-pressed` conveys the on/off state that
                  // the tick box shows sighted users.
                  aria-pressed={option.selected}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2",
                    option.selected
                      ? "text-on-surface font-medium"
                      : "text-on-surface-variant hover:bg-on-surface/[0.06]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[3px] border-2 transition-colors duration-150",
                      option.selected
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline group-hover:border-on-surface-variant",
                    )}
                  >
                    {option.selected && <Icon name="check" size={12} />}
                  </span>

                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="text-on-surface-variant shrink-0 text-xs tabular-nums">
                    {option.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 px-2 pt-1">
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Show {hiddenCount} more
              </button>
            )}
            {expanded && group.options.length > VISIBLE_OPTIONS && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Show fewer
              </button>
            )}
            {group.clearHref && (
              <Link
                href={group.clearHref}
                className="text-primary ml-auto rounded-sm text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
