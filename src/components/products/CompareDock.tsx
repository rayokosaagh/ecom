"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useCompare } from "./useCompare";

/**
 * The tray of products queued for comparison.
 *
 * Docked rather than a page of its own, because the selection is made while
 * browsing and its whole job is to stay visible without interrupting that.
 * It stays out of the way entirely until something is selected.
 */
export function CompareDock() {
  const { items, groupName, remove, clear } = useCompare();

  if (items.length === 0) return null;

  const href = `/compare?ids=${items.map((item) => item.slug).join(",")}`;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6",
        "animate-rise pointer-events-none",
      )}
      // On a phone with a gesture bar the bottom 34px of the viewport is not
      // really usable — the dock's buttons sat under the home indicator, where a
      // tap swipes the app away instead. `max()` keeps the existing 1rem on
      // every device that reports no inset, so nothing changes on desktop.
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="bg-surface-container-high shadow-elevation-3 pointer-events-auto mx-auto flex max-w-4xl flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <p className="text-on-surface-variant hidden shrink-0 text-xs tracking-wide uppercase sm:block">
          {groupName}
        </p>

        <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          {items.map((item) => (
            <li key={item.slug} className="shrink-0">
              <span className="bg-surface-container-highest text-on-surface flex h-9 items-center gap-2 rounded-full py-1 pr-1 pl-2 text-xs">
                {item.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.image}
                    alt=""
                    className="size-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <Icon name="image" size={16} className="text-on-surface-variant" />
                )}
                <span className="max-w-32 truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => remove(item.slug)}
                  aria-label={`Remove ${item.name} from comparison`}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={clear}
            className="text-on-surface-variant hover:bg-on-surface/[0.08] h-10 rounded-full px-4 text-sm transition-colors duration-200 focus-visible:outline-2"
          >
            Clear
          </button>

          {/* One product is a selection, not a comparison — the link only
              becomes meaningful at two. */}
          {items.length >= 2 ? (
            <Link
              href={href}
              className="bg-primary text-on-primary state-layer inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 sm:flex-none"
            >
              <Icon name="balance" size={18} />
              Compare {items.length}
            </Link>
          ) : (
            <span className="text-on-surface-variant text-sm">Pick one more</span>
          )}
        </div>
      </div>
    </div>
  );
}
