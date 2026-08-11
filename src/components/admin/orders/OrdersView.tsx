"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { BulkBar } from "@/components/admin/orders/BulkBar";
import { OrdersCards } from "@/components/admin/orders/OrdersCards";
import { OrdersTable } from "@/components/admin/orders/OrdersTable";
import { cn } from "@/lib/cn";
import {
  bulkAdvanceOrders,
  bulkCancelOrders,
  updateOrderStatus,
  type BulkOrderResult,
} from "@/lib/actions/orders";
import type { OrderRow } from "@/lib/orders/row-view";
import type { OrderView } from "@/lib/orders/list-params";
import type { OrderCancelReason, OrderStatus } from "@/generated/prisma/enums";

/**
 * The list, and everything stateful about looking at it.
 *
 * Selection lives here rather than in the table because the card view has the
 * same checkboxes and the bulk bar has to survive a toggle between them. The
 * two view components stay presentational: they render rows and report clicks.
 *
 * Everything that *narrows* the list is still in the URL and still server-side
 * — this owns only what a reload should legitimately forget.
 */

type Feedback = { tone: "success" | "error"; text: string } | null;

export function OrdersView({ rows, view }: { rows: OrderRow[]; view: OrderView }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Which rows are showing their contents. Held here rather than in either view
  // so expanding an order in the table and then switching to cards keeps it
  // open — the toggle changes how the list is drawn, not what you were reading.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  // A selection is made against the rows on screen. When those change — a new
  // page, a new filter — the ticks refer to orders that are no longer visible,
  // and a bulk cancel aimed at rows the reader can no longer see is exactly the
  // accident the "on this page" wording is meant to prevent.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component before anything is committed, so the bulk bar never gets painted
  // holding a count from the previous page. An effect would show the stale
  // selection for a frame and then clear it.
  const rowKey = rows.map((row) => row.id).join(",");
  const [lastRowKey, setLastRowKey] = useState(rowKey);
  if (rowKey !== lastRowKey) {
    setLastRowKey(rowKey);
    setSelected(new Set());
    setExpanded(new Set());
  }

  /** Add or remove one id, for the two sets that work exactly that way. */
  const flip = (setter: typeof setSelected) => (id: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggle = flip(setSelected);
  const expand = flip(setExpanded);

  const togglePage = (checked: boolean) =>
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());

  /** One row's quick action. No confirmation: it moves a single order one step. */
  const advanceOne = (id: string, to: OrderStatus) => {
    setBusyId(id);
    setFeedback(null);

    startTransition(async () => {
      const result = await updateOrderStatus(id, to);
      setBusyId(null);
      setFeedback(
        result.success
          ? { tone: "success", text: result.success }
          : { tone: "error", text: result.message ?? "That did not work." },
      );
    });
  };

  const report = (result: BulkOrderResult) => {
    setSelected(new Set());

    const skipped = result.skipped.length
      ? ` Skipped ${result.skipped.length}: ${result.skipped
          .map((row) => `${row.reference} (${row.why})`)
          .join(", ")}.`
      : "";

    setFeedback(
      result.success
        ? { tone: "success", text: result.success + skipped }
        : { tone: "error", text: (result.message ?? "Nothing changed.") + skipped },
    );
  };

  const advanceMany = (to: OrderStatus) => {
    const ids = [...selected];
    setFeedback(null);
    startTransition(async () => report(await bulkAdvanceOrders(ids, to)));
  };

  const cancelMany = (reason: OrderCancelReason, note: string) => {
    const ids = [...selected];
    setFeedback(null);

    // The action takes `FormData` because the single-order cancel form does, and
    // one `parseCancellation` serves both — the validation that matters is the
    // server's, and it should not have two shapes to accept.
    const formData = new FormData();
    formData.set("reason", reason);
    formData.set("note", note);

    startTransition(async () => report(await bulkCancelOrders(ids, formData)));
  };

  const exportHref = `/api/admin/orders/export?${[...selected]
    .map((id) => `id=${encodeURIComponent(id)}`)
    .join("&")}`;

  return (
    <div className="space-y-3">
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-start gap-2 rounded-md px-4 py-3 text-sm",
            feedback.tone === "success"
              ? "bg-tertiary-container text-on-tertiary-container"
              : "bg-error-container text-on-error-container",
          )}
        >
          <Icon
            name={feedback.tone === "success" ? "check_circle" : "error"}
            size={20}
            className="shrink-0"
          />
          {feedback.text}
        </p>
      )}

      {view === "table" ? (
        <OrdersTable
          rows={rows}
          selected={selected}
          onToggle={toggle}
          onTogglePage={togglePage}
          onAdvance={advanceOne}
          busyId={busyId}
          expanded={expanded}
          onExpand={expand}
        />
      ) : (
        <OrdersCards
          rows={rows}
          selected={selected}
          onToggle={toggle}
          onAdvance={advanceOne}
          busyId={busyId}
          onOpen={(id) => router.push(`/admin/orders/${id}`)}
          expanded={expanded}
          onExpand={expand}
        />
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          busy={isPending}
          exportHref={exportHref}
          onAdvance={advanceMany}
          onCancel={cancelMany}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
