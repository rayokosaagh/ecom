"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import { SocialIcon } from "@/components/social/SocialIcon";
import { useRowExit } from "@/lib/hooks/useRowExit";
import { cn } from "@/lib/cn";
import type { SocialPlatform } from "@/generated/prisma/enums";
import { socialLinkName } from "@/lib/social/catalogue";
import { readableOn, resolveHoverColor } from "@/lib/social/color";
import {
  deleteSocialLink,
  reorderSocialLinks,
  toggleSocialLinkPublished,
} from "@/lib/actions/social";

export interface SocialLinkRow {
  id: string;
  platform: SocialPlatform;
  url: string;
  label: string | null;
  hoverColor: string | null;
  iconSvg: string | null;
  published: boolean;
}

/**
 * The orderable list of social links.
 *
 * Order here is left-to-right order in the home page bar, which is the whole
 * reason this is a list rather than a table — the account the shop most wants
 * followed belongs first, and that is a decision, not an accident of when it
 * was added.
 *
 * Moves and toggles apply optimistically and persist in a transition: the
 * control should not lag a round trip behind the pointer, and the server
 * revalidates the truth back down afterwards. Same shape as `FaqList`.
 */
export function SocialLinkList({ rows }: { rows: SocialLinkRow[] }) {
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
      await reorderSocialLinks(next.map((row) => row.id));
    });
  };

  const toggle = (id: string) => {
    setItems((current) =>
      current.map((row) =>
        row.id === id ? { ...row, published: !row.published } : row,
      ),
    );
    startTransition(async () => {
      await toggleSocialLinkPublished(id);
    });
  };

  // The row plays its exit first; the filter and the server call run once it
  // has finished leaving.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((row) => row.id !== id));
      startTransition(async () => {
        await deleteSocialLink(id);
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
          "Order here is the order the icons appear in on the home page."
        )}
      </p>

      <ul className="space-y-3">
        {items.map((row, index) => {
          const name = socialLinkName(row.platform, row.label);
          const hover = resolveHoverColor(row.platform, row.hoverColor);

          return (
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
                      aria-label={`Move ${name} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_up" size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${name} down`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_down" size={18} />
                    </button>
                  </div>

                  {/* Drawn in its hover colours rather than at rest, so the
                      list answers "which colour did I give this one?" without
                      opening each row. The home page shows the neutral state
                      already; what an admin cannot see from there is the one
                      they configured. */}
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full"
                    style={{ backgroundColor: hover, color: readableOn(hover) }}
                  >
                    <SocialIcon
                      platform={row.platform}
                      iconSvg={row.iconSvg}
                      size={18}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface flex flex-wrap items-center gap-2 text-sm font-medium">
                      {name}
                      {!row.published && (
                        <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-label-sm">
                          Hidden
                        </span>
                      )}
                    </p>
                    {/* The stored address, which is not always the one that was
                        typed — a handle is expanded and `www.` dropped on save,
                        so showing it back is how an admin confirms what the
                        icon will actually open. */}
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-on-surface-variant hover:text-primary mt-0.5 block truncate rounded-sm text-xs focus-visible:outline-2"
                    >
                      {row.url}
                    </a>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={
                        row.published ? `Hide ${name}` : `Publish ${name}`
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
                      href={`/admin/social/${row.id}/edit`}
                      aria-label={`Edit ${name}`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>

                    <ConfirmDelete
                      open={confirmingId === row.id}
                      onOpenChange={(open) =>
                        setConfirmingId(open ? row.id : null)
                      }
                      onConfirm={() => remove(row.id)}
                      label={`Delete ${name}`}
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
