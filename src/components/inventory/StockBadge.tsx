import { Icon } from "@/components/ui/Icon";
import { LOW_STOCK_THRESHOLD, stockState } from "@/lib/inventory/stock";
import { cn } from "@/lib/cn";

/**
 * A level, and how worried to be about it.
 *
 * Weighted rather than uniform: out of stock is a filled pill, low is a quiet
 * one, and a healthy level is just the number. A page where every row shouts
 * has no way left to say which row matters, and this page is a worklist.
 *
 * The word is always present alongside the colour and the glyph — a red "0"
 * tells a reader who cannot see the red exactly nothing.
 */
export function StockBadge({
  stock,
  threshold = LOW_STOCK_THRESHOLD,
  className,
}: {
  stock: number;
  /** The line's own low-stock mark; the shop default when it has none. */
  threshold?: number;
  className?: string;
}) {
  const state = stockState(stock, threshold);

  if (state === "IN") {
    return (
      <span className={cn("text-on-surface text-sm tabular-nums", className)}>
        {stock}
        <span className="sr-only"> in stock</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        state === "OUT"
          ? "bg-error-container text-on-error-container"
          : "bg-surface-container-highest text-on-surface",
        className,
      )}
    >
      <Icon name={state === "OUT" ? "error" : "warning"} size={14} filled={state === "OUT"} />
      {state === "OUT" ? (
        "Out of stock"
      ) : (
        <>
          <span className="tabular-nums">{stock}</span> left
          <span className="sr-only"> — at or below the low-stock mark of {threshold}</span>
        </>
      )}
    </span>
  );
}
