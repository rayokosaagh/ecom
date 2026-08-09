"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useCompare, type CompareEntry } from "./useCompare";
import { MAX_COMPARE } from "@/lib/products/compare";

/**
 * The compare control on a product card.
 *
 * Sits inside the card's `<Link>`, so every activation has to stop the event
 * from navigating to the product — which is also why it is a button rather
 * than a checkbox: a label/input pair inside an anchor is invalid markup and
 * behaves differently across browsers.
 *
 * A product from another category is not hidden but explained. Silently
 * refusing a click reads as a broken button, whereas offering to start a new
 * comparison is the thing the shopper probably meant.
 */
export function CompareToggle({
  entry,
  className,
}: {
  entry: CompareEntry;
  className?: string;
}) {
  const { has, canAdd, toggle, restart, groupName, full } = useCompare();
  const [asking, setAsking] = useState(false);

  // Both come from the external store, which serves an empty selection during
  // hydration and the real one immediately after — so these need no guard.
  const selected = has(entry.slug);
  const allowed = canAdd(entry);

  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (asking) {
    return (
      <div
        onClick={stop}
        className={cn(
          "bg-surface-container-high text-on-surface absolute inset-x-2 bottom-2 rounded-lg p-2 text-xs shadow-elevation-2",
          className,
        )}
      >
        <p className="mb-2">
          Comparing {groupName}. Start a new comparison instead?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(event) => {
              stop(event);
              restart(entry);
              setAsking(false);
            }}
            className="bg-primary text-on-primary rounded-full px-3 py-1 font-medium"
          >
            Start new
          </button>
          <button
            type="button"
            onClick={(event) => {
              stop(event);
              setAsking(false);
            }}
            className="text-on-surface-variant rounded-full px-3 py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        stop(event);
        if (allowed) toggle(entry);
        else setAsking(true);
      }}
      aria-pressed={selected}
      title={
        allowed
          ? selected
            ? "Remove from comparison"
            : "Add to comparison"
          : `Comparing ${groupName} — pick another ${groupName} product, or start a new comparison`
      }
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
        selected
          ? "bg-primary text-on-primary"
          : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
        !allowed && !selected && "opacity-50",
        className,
      )}
    >
      <Icon name={selected ? "check" : "balance"} size={14} />
      {selected ? "Comparing" : full && allowed ? `Max ${MAX_COMPARE}` : "Compare"}
    </button>
  );
}
