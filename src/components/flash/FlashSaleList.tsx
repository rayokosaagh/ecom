"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useRowExit } from "@/lib/hooks/useRowExit";
import { deleteFlashSale, setFlashSaleActive } from "@/lib/actions/flash";
import type { FlashSaleStatus } from "@/lib/flash/service";

export interface FlashSaleListRow {
  id: string;
  name: string;
  percentOff: number;
  /** Preformatted on the server, so the list does not re-render on the clock. */
  windowLabel: string;
  active: boolean;
  productCount: number;
  status: FlashSaleStatus;
}

/** How each state reads, and what it is trying to tell the admin. */
const STATUS: Record<
  FlashSaleStatus,
  { label: string; icon: string; className: string }
> = {
  LIVE: {
    label: "Live",
    icon: "bolt",
    className: "bg-tertiary-container text-on-tertiary-container",
  },
  SCHEDULED: {
    label: "Scheduled",
    icon: "schedule",
    className: "bg-secondary-container text-on-secondary-container",
  },
  ENDED: {
    label: "Ended",
    icon: "check",
    className: "bg-surface-container-highest text-on-surface-variant",
  },
  OFF: {
    label: "Switched off",
    icon: "pause",
    className: "bg-surface-container-highest text-on-surface-variant",
  },
};

export function FlashSaleList({ rows }: { rows: FlashSaleListRow[] }) {
  const [items, setItems] = useState(rows);
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rowExit = useRowExit();

  const [lastRows, setLastRows] = useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setItems(rows);
  }

  const toggle = (id: string, active: boolean) => {
    setItems((current) =>
      current.map((row) => (row.id === id ? { ...row, active } : row)),
    );
    startTransition(async () => {
      await setFlashSaleActive(id, active);
    });
  };

  // The row plays its exit before it is dropped from state; the server call
  // rides along inside the same deferred commit.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((row) => row.id !== id));
      startTransition(async () => {
        await deleteFlashSale(id);
      });
    });
  };

  return (
    <div className="space-y-3">
      <p
        className="text-on-surface-variant flex h-5 items-center gap-2 text-xs"
        aria-live="polite"
      >
        {pending && (
          <>
            <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
            Re-pricing…
          </>
        )}
      </p>

      <ul className="space-y-3">
        {items.map((row) => {
          const status = STATUS[row.status];
          return (
            <li
            key={row.id}
            className={cn(
              rowExit.isLeaving(row.id) ? "row-leaving" : "animate-row-enter",
            )}
          >
              <Card variant="outlined">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-48 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="text-on-surface text-sm font-medium">
                        {row.name}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-medium",
                          status.className,
                        )}
                      >
                        <Icon name={status.icon} size={12} />
                        {status.label}
                      </span>
                    </p>
                    <p className="text-on-surface-variant mt-1 text-xs">
                      {row.percentOff}% off · {row.windowLabel}
                    </p>
                    <p className="text-on-surface-variant mt-1 text-xs">
                      {row.productCount === 1
                        ? "1 product"
                        : `${row.productCount} products`}
                      {row.productCount === 0 && " — nothing will show"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggle(row.id, !row.active)}
                      aria-label={
                        row.active
                          ? `Switch off ${row.name}`
                          : `Switch on ${row.name}`
                      }
                      title={
                        row.active
                          ? "Switch off — puts prices back if it is running"
                          : "Switch on"
                      }
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name={row.active ? "pause" : "play_arrow"} size={18} />
                    </button>

                    <Link
                      href={`/admin/flash-sales/${row.id}/edit`}
                      aria-label={`Edit ${row.name}`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>

                    {confirmingId === row.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => remove(row.id)}
                          className="bg-error text-on-error rounded-full px-3 py-1.5 text-xs font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="text-on-surface-variant hover:bg-on-surface/[0.08] rounded-full px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-2"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => setConfirmingId(row.id)}
                        className="text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Worth saying before the click, not after: deleting a running
                    sale is also a price change across everything in it. */}
                {confirmingId === row.id && row.status === "LIVE" && (
                  <p className="text-on-surface-variant border-outline-variant border-t px-4 py-2 text-xs">
                    This sale is running — deleting it puts all{" "}
                    {row.productCount} prices back first.
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
