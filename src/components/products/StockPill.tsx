import { Icon } from "@/components/ui/Icon";
import { stockState } from "@/lib/inventory/stock";
import { cn } from "@/lib/cn";

/**
 * Availability as a shopper needs it: a state, not a count.
 *
 * The number belongs to the dashboard — see `inventory/StockBadge`, which keeps
 * it because restocking is arithmetic. Here it is noise at best and a nudge at
 * worst: "3 in stock" reads as pressure, and "412 in stock" reads as a database
 * leaking onto the page. What a shopper is actually asking is whether they can
 * have it now, which has three answers.
 *
 * Colour carries the urgency and the word carries the meaning, always together.
 * A green pill alone says nothing to anyone who cannot see the green, and the
 * glyph differs per state for the same reason.
 */
export function StockPill({ stock, className }: { stock: number; className?: string }) {
  const state = stockState(stock);

  const { tone, icon, label } = {
    IN: {
      tone: "bg-tertiary-container text-on-tertiary-container",
      icon: "check_circle",
      label: "In stock",
    },
    LOW: {
      tone: "bg-warning-container text-on-warning-container",
      icon: "schedule",
      label: "Only a few left",
    },
    OUT: {
      tone: "bg-error-container text-on-error-container",
      icon: "remove_shopping_cart",
      label: "Sold out",
    },
  }[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon name={icon} size={16} filled />
      {label}
    </span>
  );
}
