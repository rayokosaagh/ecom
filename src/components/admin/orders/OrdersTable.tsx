"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef } from "react";

import { Icon } from "@/components/ui/Icon";
import { Expander } from "@/components/admin/orders/Expander";
import { OrderLines } from "@/components/admin/orders/OrderLines";
import { OrderStatusBadge, STATUS_LOOK } from "@/components/orders/OrderStatusBadge";
import { PendingAgeFlag } from "@/components/orders/PendingAgeFlag";
import { cn } from "@/lib/cn";
import { transitionLabel } from "@/lib/orders/transitions";
import type { OrderRow } from "@/lib/orders/row-view";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * The dense view: one order per row, seven columns, nothing that wraps.
 *
 * A table rather than a list of cards because the job at a hundred orders is
 * comparison — which of these is the oldest, which is the biggest, how many are
 * still pending — and comparison needs values in a column. Cards are better at
 * one order and worse at fifty, which is why both still exist.
 */

const HEAD = "text-on-surface-variant sticky top-0 z-10 bg-surface px-4 py-3 font-medium";
const CELL = "px-4 py-3";

/** Checkbox, order, customer, date, items, amount, status, actions. */
const COLUMNS = 8;

export function OrdersTable({
  rows,
  selected,
  onToggle,
  onTogglePage,
  onAdvance,
  busyId,
  expanded,
  onExpand,
}: {
  rows: OrderRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTogglePage: (checked: boolean) => void;
  onAdvance: (id: string, to: OrderStatus) => void;
  /** The row currently mid-move, so its control can say so and stop repeating. */
  busyId: string | null;
  expanded: Set<string>;
  onExpand: (id: string) => void;
}) {
  const router = useRouter();

  const pageChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const pagePartly = !pageChecked && rows.some((row) => selected.has(row.id));

  return (
    // A scroll pane of its own, which is what makes the header stick: `sticky`
    // resolves against the nearest scrolling ancestor, and `overflow-x-auto`
    // alone would make this that ancestor without ever scrolling vertically —
    // so the header would sit still and never lift off.
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="border-outline-variant border-b">
          <tr>
            <th scope="col" className={cn(HEAD, "w-10 pr-0")}>
              <SelectAll
                checked={pageChecked}
                partial={pagePartly}
                onChange={onTogglePage}
                count={rows.length}
              />
            </th>
            <th scope="col" className={HEAD}>
              Order
            </th>
            <th scope="col" className={HEAD}>
              Customer
            </th>
            <th scope="col" className={HEAD}>
              Date
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              Items
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              Amount
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const isSelected = selected.has(row.id);
            const isOpen = expanded.has(row.id);

            return (
              <Fragment key={row.id}>
              <tr
                // The whole row opens the order. The reference cell is still a
                // real link — that is the keyboard route and the one that opens
                // in a new tab — but a pointer should not have to find it.
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  // Anything that does its own thing keeps doing it.
                  if (target.closest("a, button, input, label")) return;
                  // Selecting an email address should copy it, not navigate.
                  if (window.getSelection()?.toString()) return;
                  router.push(`/admin/orders/${row.id}`);
                }}
                className={cn(
                  "group/row border-outline-variant cursor-pointer border-b transition-colors duration-200 last:border-0",
                  isSelected ? "bg-primary/[0.06]" : "hover:bg-on-surface/[0.04]",
                )}
              >
                <td className={cn(CELL, "pr-0")}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(row.id)}
                    aria-label={`Select order ${row.reference}`}
                    className="accent-primary size-4 cursor-pointer align-middle"
                  />
                </td>

                <td className={CELL}>
                  <span className="flex items-center gap-1">
                    <Expander
                      open={isOpen}
                      onClick={() => onExpand(row.id)}
                      controls={`lines-${row.id}`}
                      reference={row.reference}
                      count={row.items}
                    />
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="text-on-surface rounded-sm font-medium tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {row.reference}
                    </Link>
                  </span>
                </td>

                <td className={cn(CELL, "max-w-[16rem]")}>
                  <span className="text-on-surface block truncate">{row.customer}</span>
                  <span className="text-on-surface-variant block truncate text-xs">
                    {row.email}
                    {row.place && ` · ${row.place}`}
                  </span>
                </td>

                {/* The full timestamp lives in the title, because "2 hours ago"
                    has thrown it away and someone reconciling a payment wants it. */}
                <td className={cn(CELL, "text-on-surface-variant whitespace-nowrap")}>
                  <span title={row.date.title}>{row.date.text}</span>
                </td>

                <td className={cn(CELL, "text-on-surface-variant text-right tabular-nums")}>
                  {row.items}
                </td>

                <td className={cn(CELL, "text-on-surface text-right tabular-nums")}>
                  {row.amount}
                </td>

                <td className={CELL}>
                  <span className="flex items-center gap-1.5">
                    <OrderStatusBadge status={row.status} fulfilment={row.fulfilment} />
                    <PendingAgeFlag overdue={row.overdue} />
                  </span>
                </td>

                <td className={cn(CELL, "text-right")}>
                  <QuickAction
                    to={row.advance}
                    busy={busyId === row.id}
                    onClick={() => row.advance && onAdvance(row.id, row.advance)}
                  />
                </td>
              </tr>

              {/* A row of its own rather than markup inside the last cell: the
                  lines belong to the whole order, not to its Actions column,
                  and spanning the table is the only way to say that. It carries
                  no click handler, so expanding a row does not turn its contents
                  into a second way to navigate away from the list. */}
              {isOpen && (
                <tr id={`lines-${row.id}`} className="border-outline-variant border-b last:border-0">
                  <td colSpan={COLUMNS} className="px-4 pt-0 pb-3">
                    <OrderLines
                      lines={row.lines}
                      hidden={row.hiddenLines}
                      href={`/admin/orders/${row.id}`}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Select every order on this page.
 *
 * Deliberately "on this page" and not "all 4,312 matching" — a checkbox that
 * silently selects rows the reader has never seen is how a bulk cancel goes
 * wrong. The label says which, and the indeterminate state says that some of
 * the page is already ticked without claiming all of it is.
 */
function SelectAll({
  checked,
  partial,
  onChange,
  count,
}: {
  checked: boolean;
  partial: boolean;
  onChange: (checked: boolean) => void;
  count: number;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` is a property, not an attribute — there is no way to set it
  // in JSX.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={`Select all ${count} orders on this page`}
      className="accent-primary size-4 cursor-pointer align-middle"
    />
  );
}

/**
 * The one move this order can make, on hover.
 *
 * Hidden until the row is hovered or something in it takes focus, so fifty rows
 * do not each shout an action — but always present under `md`, where there is
 * no hover to reveal it with and an invisible button is simply a missing one.
 *
 * Which move it offers comes from the transition table, so a pending order is
 * offered "Mark as paid" rather than a "Mark as shipped" the server would
 * refuse. Terminal statuses get nothing, which is the honest answer.
 */
function QuickAction({
  to,
  busy,
  onClick,
}: {
  to: OrderStatus | null;
  busy: boolean;
  onClick: () => void;
}) {
  if (!to) return null;

  const label = transitionLabel(to);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn(
        "text-on-surface-variant hover:bg-on-surface/[0.08] inline-grid size-9 place-items-center rounded-full",
        "transition-[opacity,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:text-on-surface/[0.38]",
        "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100",
        "max-md:opacity-100",
      )}
    >
      <Icon name={busy ? "progress_activity" : STATUS_LOOK[to].icon} size={18} />
    </button>
  );
}
