"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useListParams } from "@/lib/hooks/useListParams";
import {
  DATE_RANGE_OPTIONS,
  PER_PAGE_OPTIONS,
  SORT_OPTIONS,
  type OrderView,
} from "@/lib/orders/list-params";

/**
 * Everything above the list that changes what the list is, except the search
 * box and the status rail.
 *
 * One component rather than four because they share a row, and because they
 * share the rule that changing any of them returns you to page 1 — see
 * `useListParams`.
 */

const CONTROL =
  "h-9 appearance-none rounded-full border py-0 pr-9 pl-4 text-sm outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2";

/** A select that looks like the toolbar's, with the chevron the native one lacks. */
function PillSelect({
  label,
  value,
  onChange,
  options,
  tinted,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Filled when it is holding a non-default value, so an active filter reads as one. */
  tinted: boolean;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          CONTROL,
          tinted
            ? "border-secondary-container bg-secondary-container text-on-secondary-container"
            : "border-outline text-on-surface-variant",
        )}
      >
        {options.map((option) => (
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
          tinted ? "text-on-secondary-container" : "text-on-surface-variant",
        )}
      />
    </label>
  );
}

export function OrdersControls({
  view,
  sort,
  perPage,
  isDefaultSort,
}: {
  view: OrderView;
  sort: string;
  perPage: number;
  /** Whether `sort` is the tab's own default, so the pill only tints when chosen. */
  isDefaultSort: boolean;
}) {
  const { get, set } = useListParams();

  const range = get("range");
  const from = get("from");
  const to = get("to");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PillSelect
        label="Sort orders"
        value={sort}
        onChange={(value) => set({ sort: value })}
        options={SORT_OPTIONS}
        tinted={!isDefaultSort}
      />

      <PillSelect
        label="Filter by date placed"
        value={range}
        onChange={(value) =>
          // Leaving the custom range drops its two dates, so they cannot sit in
          // the URL narrowing a list whose control no longer shows them.
          set({ range: value, ...(value === "custom" ? {} : { from: null, to: null }) })
        }
        options={[{ value: "", label: "Any date" }, ...DATE_RANGE_OPTIONS]}
        tinted={range !== ""}
      />

      {range === "custom" && (
        <span className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="orders-from">
            From date
          </label>
          <input
            id="orders-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => set({ from: event.target.value })}
            className="border-outline text-on-surface h-9 rounded-full border bg-transparent px-3 text-sm outline-none focus-visible:outline-2"
          />
          <span className="text-on-surface-variant text-sm">–</span>
          <label className="sr-only" htmlFor="orders-to">
            To date
          </label>
          <input
            id="orders-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => set({ to: event.target.value })}
            className="border-outline text-on-surface h-9 rounded-full border bg-transparent px-3 text-sm outline-none focus-visible:outline-2"
          />
        </span>
      )}

      <PillSelect
        label="Orders per page"
        value={String(perPage)}
        onChange={(value) => set({ perPage: value })}
        options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: `${n} per page` }))}
        tinted={false}
      />

      <ViewToggle view={view} onChange={(next) => set({ view: next }, { resetPage: false })} />
    </div>
  );
}

/**
 * Table or cards.
 *
 * A pair of pressed-state buttons rather than a select: there are two options,
 * both fit on screen, and the choice is about how the page *looks* — a control
 * you can see the result of should not be hidden behind a menu.
 *
 * Switching does not reset the page, unlike every other control here. It
 * changes nothing about which orders match, so throwing the reader back to page
 * 1 would be losing their place for no reason.
 */
function ViewToggle({
  view,
  onChange,
}: {
  view: OrderView;
  onChange: (view: OrderView) => void;
}) {
  const options: { value: OrderView; icon: string; label: string }[] = [
    { value: "table", icon: "table_rows", label: "Table view" },
    { value: "cards", icon: "grid_view", label: "Card view" },
  ];

  return (
    <div
      role="group"
      aria-label="View"
      className="border-outline ml-auto inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {options.map((option) => {
        const active = view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              active
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-on-surface/[0.06]",
            )}
          >
            <Icon name={option.icon} size={18} filled={active} />
          </button>
        );
      })}
    </div>
  );
}
