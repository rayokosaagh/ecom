"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
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
 * The roomy view: one card per order, everything on its own line.
 *
 * The original list, kept rather than replaced. It is the better shape on a
 * phone, where a seven-column table is a horizontal scroll with no context, and
 * it is the better shape for reading a handful of orders closely rather than
 * comparing fifty. The toggle exists because both of those are real.
 *
 * The card is no longer wrapped in a `Link`: it now contains a checkbox and an
 * action button, and an anchor containing a control is invalid markup that
 * behaves differently in every browser. The reference is the link instead, and
 * the card body handles the pointer — the same arrangement the table uses.
 */
export function OrdersCards({
  rows,
  selected,
  onToggle,
  onAdvance,
  busyId,
  onOpen,
  expanded,
  onExpand,
}: {
  rows: OrderRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAdvance: (id: string, to: OrderStatus) => void;
  busyId: string | null;
  onOpen: (id: string) => void;
  expanded: Set<string>;
  onExpand: (id: string) => void;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const isSelected = selected.has(row.id);
        const isOpen = expanded.has(row.id);

        return (
          <li key={row.id}>
            <Card
              variant="outlined"
              interactive
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("a, button, input, label")) return;
                if (window.getSelection()?.toString()) return;
                onOpen(row.id);
              }}
              className={cn(
                "group/row cursor-pointer transition-colors duration-200",
                isSelected && "bg-primary/[0.06]",
              )}
            >
              <div className="flex flex-wrap items-center gap-3 p-4">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(row.id)}
                  aria-label={`Select order ${row.reference}`}
                  className="accent-primary size-4 shrink-0 cursor-pointer"
                />

                <Expander
                  open={isOpen}
                  onClick={() => onExpand(row.id)}
                  controls={`lines-${row.id}`}
                  reference={row.reference}
                  count={row.items}
                />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="text-on-surface truncate rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {row.customer}
                    </Link>
                    <span className="text-on-surface-variant shrink-0 text-xs tabular-nums">
                      #{row.reference}
                    </span>
                  </p>
                  <p className="text-on-surface-variant mt-0.5 truncate text-xs">
                    {row.email}
                    {row.place && ` · ${row.place}`}
                  </p>
                  <p className="text-on-surface-variant mt-1 text-xs">
                    {row.items} item{row.items === 1 ? "" : "s"} ·{" "}
                    <span title={row.date.title}>{row.date.text}</span>
                  </p>
                </div>

                <p className="text-on-surface shrink-0 text-sm tabular-nums">{row.amount}</p>
                <OrderStatusBadge status={row.status} fulfilment={row.fulfilment} />
                <PendingAgeFlag overdue={row.overdue} />

                {row.advance ? (
                  <button
                    type="button"
                    onClick={() => onAdvance(row.id, row.advance!)}
                    disabled={busyId === row.id}
                    aria-label={transitionLabel(row.advance)}
                    title={transitionLabel(row.advance)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] disabled:text-on-surface/[0.38] grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon
                      name={
                        busyId === row.id ? "progress_activity" : STATUS_LOOK[row.advance].icon
                      }
                      size={18}
                    />
                  </button>
                ) : (
                  <Icon
                    name="chevron_right"
                    size={18}
                    className="text-on-surface-variant shrink-0"
                  />
                )}
              </div>

              {isOpen && (
                <div id={`lines-${row.id}`} className="px-4 pb-4">
                  <OrderLines
                    lines={row.lines}
                    hidden={row.hiddenLines}
                    href={`/admin/orders/${row.id}`}
                  />
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
