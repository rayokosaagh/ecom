"use client";

import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

/**
 * The delete control, and the confirmation it turns into.
 *
 * Both states are rendered and stacked, with the row sized to whichever is
 * showing — that is what lets the swap be a transition rather than a
 * substitution. Rendering one *or* the other cannot animate: the outgoing
 * markup is gone before the incoming exists, so the buttons beside it jump the
 * width of "Delete Keep" the instant the trash icon is pressed.
 *
 * The crossfade is M3's fade-through: the outgoing state leaves on opacity
 * alone while the incoming one arrives on opacity *and* a small scale, so the
 * two are never both fully present and the eye follows the arriving one.
 *
 * Controlled rather than self-managing, because the lists that use it allow
 * only one row to be confirming at a time — that is a property of the list, not
 * of any single row, and a component holding its own `open` could not enforce
 * it.
 */
export function ConfirmDelete({
  open,
  onOpenChange,
  onConfirm,
  label,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Names the record, e.g. `Delete “Shipping FAQ”`. */
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 items-center",
        // Both children occupy the same cell; the wider one sets the width, so
        // the surrounding controls never shift as the two swap.
        "[&>*]:col-start-1 [&>*]:row-start-1",
        className,
      )}
    >
      <span
        aria-hidden={open}
        className={cn(
          "transition-[opacity,transform] duration-[var(--duration-short4)] ease-standard",
          open
            ? "pointer-events-none scale-90 opacity-0"
            : "scale-100 opacity-100",
        )}
      >
        <button
          type="button"
          aria-label={label}
          tabIndex={open ? -1 : undefined}
          onClick={() => onOpenChange(true)}
          className="text-on-surface-variant hover:text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-[var(--duration-short2)] focus-visible:outline-2"
        >
          <Icon name="delete" size={18} />
        </button>
      </span>

      <span
        aria-hidden={!open}
        className={cn(
          "flex items-center gap-1 justify-self-end",
          "transition-[opacity,transform] duration-[var(--duration-short4)] ease-emphasized",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
        )}
      >
        <button
          type="button"
          tabIndex={open ? undefined : -1}
          onClick={onConfirm}
          className="text-on-error bg-error state-layer rounded-full px-3 py-1.5 text-sm font-medium transition-transform duration-[var(--duration-short2)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          Delete
        </button>
        <button
          type="button"
          tabIndex={open ? undefined : -1}
          onClick={() => onOpenChange(false)}
          className="text-on-surface-variant state-layer rounded-full px-3 py-1.5 text-sm transition-transform duration-[var(--duration-short2)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          Keep
        </button>
      </span>
    </span>
  );
}
