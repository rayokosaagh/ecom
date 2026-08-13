"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useRowExit } from "@/lib/hooks/useRowExit";
import {
  deleteSpecDefinition,
  reorderSpecDefinitions,
  toggleSpecFilterable,
} from "@/lib/actions/specs";

export interface SpecDefinitionRow {
  id: string;
  label: string;
  key: string;
  unit: string | null;
  group: string | null;
  icon: string | null;
  filterable: boolean;
  productCount: number;
  /** Distinct answers across the catalogue — how many facet options it yields. */
  valueCount: number;
}

/** M3-style switch. A real `role="switch"` button, so it is keyboard operable. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-8 w-13 shrink-0 rounded-full border-2 transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        checked ? "bg-primary border-primary" : "bg-surface-container-highest border-outline",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 block -translate-y-1/2 rounded-full transition-all duration-200 ease-emphasized",
          checked
            ? "bg-on-primary left-[calc(100%-1.5rem)] size-6"
            : "bg-outline left-1 size-4",
        )}
      />
    </button>
  );
}

/**
 * Spec labels, in the order every product page will list them.
 *
 * Order is a property of the label rather than of any one product, which is
 * what this list exists to control — reordering here restacks the spec table
 * on the whole catalogue at once.
 */
export function SpecDefinitionList({ rows }: { rows: SpecDefinitionRow[] }) {
  const [items, setItems] = useState(rows);
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rowExit = useRowExit();

  // The server is the source of truth after any mutation revalidates. Adopting
  // new props during render (rather than in an effect) is React's documented
  // way to reset state when an input changes.
  const [lastRows, setLastRows] = useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setItems(rows);
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    startTransition(async () => {
      await reorderSpecDefinitions(next.map((row) => row.id));
    });
  };

  const toggle = (id: string) => {
    // Optimistic: the switch should not lag a round trip behind the pointer.
    setItems((current) =>
      current.map((row) =>
        row.id === id ? { ...row, filterable: !row.filterable } : row,
      ),
    );
    startTransition(async () => {
      await toggleSpecFilterable(id);
    });
  };

  // The row plays its exit before it is dropped from state; the server call
  // rides along inside the same deferred commit.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((row) => row.id !== id));
      startTransition(async () => {
        await deleteSpecDefinition(id);
      });
    });
  };

  return (
    <div className="space-y-3">
      <p
        className="text-on-surface-variant flex h-5 items-center gap-2 text-xs"
        aria-live="polite"
      >
        {pending ? (
          <>
            <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
            Saving…
          </>
        ) : (
          "Order here is the order every product page lists its specs in."
        )}
      </p>

      <ul className="space-y-3">
        {items.map((row, index) => (
          <li
            key={row.id}
            className={cn(
              rowExit.isLeaving(row.id) ? "row-leaving" : "animate-row-enter",
            )}
          >
            <Card variant="outlined">
              <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="hidden flex-col sm:flex">
                  <button
                    type="button"
                    aria-label={`Move ${row.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                  >
                    <Icon name="keyboard_arrow_up" size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.label} down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                  >
                    <Icon name="keyboard_arrow_down" size={18} />
                  </button>
                </div>

                <div className="bg-secondary-container text-on-secondary-container grid size-10 shrink-0 place-items-center rounded-lg">
                  <Icon name={row.icon || "label"} size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-on-surface truncate text-sm font-medium">
                    {row.label}
                    {row.unit && (
                      <span className="text-on-surface-variant font-normal"> ({row.unit})</span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {row.group && (
                      <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5">
                        {row.group}
                      </span>
                    )}
                    <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5">
                      {row.productCount === 1
                        ? "1 product"
                        : `${row.productCount} products`}
                    </span>
                    {/* A label whose every product answers differently makes a
                        facet where each option matches one thing — the number
                        is here so that is visible before switching it on. */}
                    <span className="text-on-surface-variant">
                      {row.valueCount === 1
                        ? "1 distinct value"
                        : `${row.valueCount} distinct values`}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={row.filterable}
                    onChange={() => toggle(row.id)}
                    label={`${row.filterable ? "Stop offering" : "Offer"} ${row.label} as a filter`}
                  />

                  <Link
                    href={`/admin/specs/${row.id}/edit`}
                    aria-label={`Edit ${row.label}`}
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
                      aria-label={`Delete ${row.label}`}
                      onClick={() => setConfirmingId(row.id)}
                      className="text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="delete" size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Unlike deleting a brand, this takes data with it. */}
              {confirmingId === row.id && row.productCount > 0 && (
                <p className="text-on-surface-variant border-outline-variant border-t px-4 py-2 text-xs">
                  Removes “{row.label}” from{" "}
                  {row.productCount === 1 ? "1 product" : `${row.productCount} products`}.
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
