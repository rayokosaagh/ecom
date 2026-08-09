"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import { useRowExit } from "@/lib/hooks/useRowExit";
import { cn } from "@/lib/cn";
import { deleteFaq, reorderFaqs, toggleFaqPublished } from "@/lib/actions/faqs";

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  published: boolean;
}

/**
 * The orderable list of questions.
 *
 * Order here is the order the home page reads them in, which is the whole
 * reason this is a list rather than a table — an FAQ is a sequence, and the
 * first question should be the one most people arrive with.
 *
 * Moves and toggles apply optimistically and persist in a transition: the
 * control should not lag a round trip behind the pointer, and the server
 * revalidates the truth back down afterwards.
 */
export function FaqList({ rows }: { rows: FaqRow[] }) {
  const [items, setItems] = useState(rows);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
      await reorderFaqs(next.map((row) => row.id));
    });
  };

  const toggle = (id: string) => {
    setItems((current) =>
      current.map((row) =>
        row.id === id ? { ...row, published: !row.published } : row,
      ),
    );
    startTransition(async () => {
      await toggleFaqPublished(id);
    });
  };

  // The row plays its exit first; the filter and the server call run once it
  // has finished leaving.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((row) => row.id !== id));
      startTransition(async () => {
        await deleteFaq(id);
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
          "Order here is the order the home page lists them in."
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
              <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="hidden flex-col pt-1 sm:flex">
                  <button
                    type="button"
                    aria-label={`Move “${row.question}” up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                  >
                    <Icon name="keyboard_arrow_up" size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move “${row.question}” down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                  >
                    <Icon name="keyboard_arrow_down" size={18} />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-on-surface flex flex-wrap items-center gap-2 text-sm font-medium">
                    {row.question}
                    {!row.published && (
                      <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-[11px]">
                        Hidden
                      </span>
                    )}
                  </p>
                  {/* Two lines of the answer: enough to tell two similar
                      questions apart, not so much that the list becomes the
                      FAQ itself. */}
                  <p className="text-on-surface-variant mt-1 line-clamp-2 text-sm">
                    {row.answer}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={
                      row.published
                        ? `Hide “${row.question}”`
                        : `Publish “${row.question}”`
                    }
                    onClick={() => toggle(row.id)}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
                  >
                    <Icon
                      name={row.published ? "visibility" : "visibility_off"}
                      size={18}
                    />
                  </button>

                  <Link
                    href={`/admin/faqs/${row.id}/edit`}
                    aria-label={`Edit “${row.question}”`}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
                  >
                    <Icon name="edit" size={18} />
                  </Link>

                  <ConfirmDelete
                    open={confirmingId === row.id}
                    onOpenChange={(open) => setConfirmingId(open ? row.id : null)}
                    onConfirm={() => remove(row.id)}
                    label={`Delete “${row.question}”`}
                  />
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
