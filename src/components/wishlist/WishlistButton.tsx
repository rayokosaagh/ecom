"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { toggleWishlist } from "@/lib/actions/wishlist";

/**
 * Heart toggle. Renders optimistically — the heart fills the instant it is
 * tapped, and the revalidated server state confirms (or reverts) it when the
 * action lands.
 *
 * Often rendered inside a Link-wrapped card, hence the preventDefault /
 * stopPropagation: tapping the heart must not also open the product page.
 */
export function WishlistButton({
  productId,
  wishlisted,
  className,
}: {
  productId: string;
  wishlisted: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(wishlisted);

  return (
    <button
      type="button"
      aria-label={optimistic ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleWishlist(productId, pathname);
        });
      }}
      className={cn(
        // Sits on every product card and overlaps a card that is otherwise one
        // large link, so on touch it needs to be both bigger and unambiguously
        // its own target.
        "grid size-9 place-items-center rounded-full transition-all duration-200 pointer-coarse:size-11",
        "bg-surface/80 backdrop-blur-sm",
        "hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2",
        "active:scale-90",
        optimistic ? "text-error" : "text-on-surface-variant",
        className,
      )}
    >
      <Icon name="favorite" size={20} filled={optimistic} />
    </button>
  );
}
