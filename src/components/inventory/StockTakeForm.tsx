"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { applyStockTake, type StockTakeState } from "@/lib/actions/inventory";
import { planStockTake } from "@/lib/inventory/stock-take";
import {
  MAX_NOTE_LENGTH,
  REASONS_FOR_ADDING,
  REASONS_FOR_REMOVING,
  REASON_LABELS,
  formatDelta,
} from "@/lib/inventory/stock";
import { StockBadge } from "@/components/inventory/StockBadge";
import { cn } from "@/lib/cn";

export interface StockTakeRow {
  key: string;
  name: string;
  configuration: string | null;
  sku: string | null;
  image: string | null;
  published: boolean;
  stock: number;
  threshold: number;
}

/**
 * Count a shelf, then save it once.
 *
 * One editable column — Counted — down a list of lines, one reason and one
 * note for the lot, one Save. The preview under the table runs the same
 * `planStockTake` the action runs, so "12 lines to update, 3 already match,
 * 30 not counted" is the plan that will be applied rather than a guess at it,
 * and a negative or non-numeric count is refused before the button is
 * pressed.
 *
 * The expected level travels with each row as a hidden field: the action
 * writes each line conditionally on it, and if anything sold between the
 * page loading and Save, nothing is written and the moved lines are marked
 * here so they can be recounted.
 */
export function StockTakeForm({ rows }: { rows: StockTakeRow[] }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<string>("RECOUNT");

  const [state, formAction, pending] = useActionState<StockTakeState, FormData>(
    async (previous, formData) => {
      const result = await applyStockTake(previous, formData);
      if (result.success) setCounts({});
      return result;
    },
    {},
  );

  const plan = useMemo(
    () =>
      planStockTake({
        keys: rows.map((row) => row.key),
        expected: rows.map((row) => String(row.stock)),
        counted: rows.map((row) => counts[row.key] ?? ""),
      }),
    [rows, counts],
  );

  const conflicts = new Set(state.conflicts ?? []);
  const reasons = [...new Set([...REASONS_FOR_ADDING, ...REASONS_FOR_REMOVING])];

  if (rows.length === 0) {
    return (
      <p className="text-on-surface-variant py-10 text-center text-sm">
        Nothing to count here — widen the filter.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="border-outline-variant overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-on-surface-variant border-outline-variant border-b">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Line</th>
              <th scope="col" className="px-4 py-3 font-medium">In the book</th>
              <th scope="col" className="px-4 py-3 font-medium">Counted</th>
              <th scope="col" className="px-4 py-3 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const typed = counts[row.key] ?? "";
              const count = typed.trim() === "" ? null : Number(typed);
              const delta = count === null || !Number.isFinite(count) ? null : count - row.stock;
              const conflicted = conflicts.has(row.key);
              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-outline-variant border-b last:border-0",
                    conflicted && "bg-error-container/30",
                  )}
                >
                  <td className="px-4 py-2">
                    <input type="hidden" name="key" value={row.key} />
                    <input type="hidden" name="expected" value={row.stock} />
                    <div className="flex items-center gap-3">
                      <div className="bg-surface-container-highest size-9 shrink-0 overflow-hidden rounded-md">
                        {row.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={row.image} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-on-surface truncate">
                          {row.name}
                          {!row.published && (
                            <span className="bg-surface-container-highest text-on-surface-variant ml-2 rounded-full px-2 py-0.5 text-label-sm">
                              Draft
                            </span>
                          )}
                        </p>
                        <p className="text-on-surface-variant truncate text-xs">
                          {row.configuration ?? "No configurations"}
                          {row.sku && <> · SKU {row.sku}</>}
                        </p>
                        {conflicted && (
                          <p className="text-error text-xs">Changed since the page loaded — recount</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StockBadge stock={row.stock} threshold={row.threshold} />
                  </td>
                  <td className="px-4 py-2">
                    <label className="sr-only" htmlFor={`count-${row.key}`}>
                      Counted units for {row.name}
                      {row.configuration ? ` · ${row.configuration}` : ""}
                    </label>
                    <input
                      id={`count-${row.key}`}
                      name="counted"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={typed}
                      onChange={(event) =>
                        setCounts((current) => ({ ...current, [row.key]: event.target.value }))
                      }
                      placeholder="—"
                      className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-9 w-24 rounded-md border bg-transparent px-3 text-sm tabular-nums outline-none transition-colors duration-200"
                    />
                  </td>
                  <td className="text-on-surface-variant px-4 py-2 text-xs tabular-nums">
                    {delta === null ? (
                      <span className="opacity-60">not counted</span>
                    ) : delta === 0 ? (
                      "matches"
                    ) : (
                      <span className={delta < 0 ? "text-error" : "text-tertiary"}>
                        {formatDelta(delta)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-surface-container-low border-outline-variant flex flex-wrap items-start gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="stock-take-reason" className="text-on-surface-variant text-xs">
            Reason for the whole count
          </label>
          <select
            id="stock-take-reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="border-outline text-on-surface focus:border-primary h-10 rounded-md border bg-transparent px-3 text-sm outline-none"
          >
            {reasons.map((value) => (
              <option key={value} value={value}>
                {REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <label htmlFor="stock-take-note" className="text-on-surface-variant text-xs">
            Note (optional)
          </label>
          <input
            id="stock-take-note"
            name="note"
            type="text"
            maxLength={MAX_NOTE_LENGTH}
            placeholder="Who counted, which shelf, the delivery number…"
            className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 rounded-md border bg-transparent px-3 text-sm outline-none"
          />
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p
            role={!plan.ok ? "alert" : undefined}
            className={cn("text-xs", !plan.ok ? "text-error" : "text-on-surface-variant")}
          >
            {!plan.ok
              ? plan.error
              : plan.data.changes.length === 0
                ? `Nothing to save yet${plan.data.unchanged > 0 ? ` — ${plan.data.unchanged} counted and matching` : ""}.`
                : `${plan.data.changes.length} line${plan.data.changes.length === 1 ? "" : "s"} to update · ${plan.data.unchanged} already match · ${plan.data.skipped} not counted`}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/inventory"
              className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
            >
              Back to Inventory
            </Link>
            <button
              type="submit"
              disabled={pending || !plan.ok || plan.data.changes.length === 0}
              className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon name="fact_check" size={18} />
              {pending ? "Saving…" : "Save stock take"}
            </button>
          </div>
        </div>

        {state.message && (
          <p role="alert" className="text-error w-full text-sm">
            {state.message}
          </p>
        )}
        {state.success && (
          <p role="status" className="text-tertiary w-full text-sm">
            {state.success}
          </p>
        )}
      </div>
    </form>
  );
}
