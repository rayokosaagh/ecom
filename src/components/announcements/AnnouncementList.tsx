"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import { useRowExit } from "@/lib/hooks/useRowExit";
import { cn } from "@/lib/cn";
import { ANNOUNCEMENT_LEVELS } from "@/lib/announcements/levels";
import {
  deleteAnnouncement,
  reorderAnnouncements,
  toggleAnnouncementPublished,
} from "@/lib/actions/announcements";
import type { AnnouncementLevel } from "@/generated/prisma/enums";

export interface AnnouncementRow {
  id: string;
  message: string;
  level: AnnouncementLevel;
  href: string | null;
  published: boolean;
}

/**
 * The orderable list of notices.
 *
 * Order here is the order they scroll past in, which is the whole reason this
 * is a list rather than a table — the strip is a sequence, and the notice that
 * matters most should be the one a visitor meets first.
 *
 * Moves and toggles apply optimistically and persist in a transition: the
 * control should not lag a round trip behind the pointer, and the server
 * revalidates the truth back down afterwards. Same shape as `FaqList`.
 */
export function AnnouncementList({ rows }: { rows: AnnouncementRow[] }) {
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
      await reorderAnnouncements(next.map((row) => row.id));
    });
  };

  const toggle = (id: string) => {
    setItems((current) =>
      current.map((row) =>
        row.id === id ? { ...row, published: !row.published } : row,
      ),
    );
    startTransition(async () => {
      await toggleAnnouncementPublished(id);
    });
  };

  // The row plays its exit first; the filter and the server call run once it
  // has finished leaving.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((row) => row.id !== id));
      startTransition(async () => {
        await deleteAnnouncement(id);
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
          "Order here is the order they scroll past in."
        )}
      </p>

      <ul className="space-y-3">
        {items.map((row, index) => {
          const style = ANNOUNCEMENT_LEVELS[row.level];

          return (
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
                      aria-label={`Move “${row.message}” up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_up" size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move “${row.message}” down`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_down" size={18} />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      {/* The level as the strip would draw it. On a screen
                          where four levels sit together, the chip is the only
                          thing that says which is which at a glance. */}
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-medium",
                          style.chip,
                        )}
                      >
                        <Icon name={style.icon} size={12} filled />
                        {style.label}
                      </span>
                      <span className="text-on-surface min-w-0 text-sm font-medium">
                        {row.message}
                      </span>
                      {!row.published && (
                        <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-label-sm">
                          Hidden
                        </span>
                      )}
                    </p>

                    {row.href && (
                      <p className="text-on-surface-variant mt-1 flex items-center gap-1 truncate text-xs">
                        <Icon name="link" size={12} />
                        {row.href}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={
                        row.published
                          ? `Hide “${row.message}”`
                          : `Publish “${row.message}”`
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
                      href={`/admin/announcements/${row.id}/edit`}
                      aria-label={`Edit “${row.message}”`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>

                    <ConfirmDelete
                      open={confirmingId === row.id}
                      onOpenChange={(open) => setConfirmingId(open ? row.id : null)}
                      onConfirm={() => remove(row.id)}
                      label={`Delete “${row.message}”`}
                    />
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
