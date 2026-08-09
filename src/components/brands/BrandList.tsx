"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { useRowExit } from "@/lib/hooks/useRowExit";
import { cn } from "@/lib/cn";
import { clearBrandIcon, deleteBrand } from "@/lib/actions/brands";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  iconSvg: string | null;
  logo: string | null;
  productCount: number;
}

export function BrandList({ brands }: { brands: BrandRow[] }) {
  const [items, setItems] = useState(brands);
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rowExit = useRowExit();

  // The server is the source of truth after any mutation revalidates. Adopting
  // new props during render (rather than in an effect) is React's documented
  // way to reset state when an input changes.
  const [lastBrands, setLastBrands] = useState(brands);
  if (lastBrands !== brands) {
    setLastBrands(brands);
    setItems(brands);
  }

  // The row plays its exit before it is dropped from state; the server call
  // rides along inside the same deferred commit.
  const remove = (id: string) => {
    setConfirmingId(null);
    rowExit.remove(id, () => {
      setItems((current) => current.filter((brand) => brand.id !== id));
      startTransition(async () => {
        await deleteBrand(id);
      });
    });
  };

  const clearIcon = (id: string) => {
    setItems((current) =>
      current.map((brand) => (brand.id === id ? { ...brand, iconSvg: null } : brand)),
    );
    startTransition(async () => {
      await clearBrandIcon(id);
    });
  };

  return (
    <div className="space-y-3">
      <p
        className="text-on-surface-variant flex h-5 items-center gap-2 text-xs"
        aria-live="polite"
      >
        {pending && (
          <>
            <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
            Saving…
          </>
        )}
      </p>

      <ul className="space-y-3">
        {items.map((brand) => (
          <li
            key={brand.id}
            className={cn(
              rowExit.isLeaving(brand.id) ? "row-leaving" : "animate-row-enter",
            )}
          >
            <Card variant="outlined">
              <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="bg-surface-container-highest text-on-surface grid size-14 shrink-0 place-items-center rounded-lg">
                  {brand.iconSvg || brand.logo ? (
                    /* Capped to the swatch: a hosted logo's own width
                       allowance is sized for a card's text line and would
                       spill out of this box. */
                    <BrandMark
                      svg={brand.iconSvg}
                      logo={brand.logo}
                      size={32}
                      className="max-w-full!"
                    />
                  ) : (
                    <Icon
                      name="hide_image"
                      size={22}
                      className="text-on-surface-variant"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-on-surface truncate text-sm font-medium">
                    {brand.name}
                  </p>
                  <p className="text-on-surface-variant truncate text-xs">
                    /products?brand={brand.slug}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5">
                      {brand.productCount === 1
                        ? "1 product"
                        : `${brand.productCount} products`}
                    </span>
                    {!brand.iconSvg && !brand.logo && (
                      <span className="text-on-surface-variant">No mark yet</span>
                    )}
                    {/* Worth calling out rather than leaving to be discovered:
                        a hosted image cannot take the colour of the surface it
                        lands on, so this brand is the one to check in dark. */}
                    {!brand.iconSvg && brand.logo && (
                      <span className="text-on-surface-variant">Image only</span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {brand.iconSvg && (
                    <button
                      type="button"
                      aria-label={`Remove the ${brand.name} vector mark`}
                      title="Remove vector mark"
                      onClick={() => clearIcon(brand.id)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="hide_image" size={18} />
                    </button>
                  )}

                  <Link
                    href={`/admin/brands/${brand.id}/edit`}
                    aria-label={`Edit ${brand.name}`}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon name="edit" size={18} />
                  </Link>

                  {confirmingId === brand.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => remove(brand.id)}
                        className="bg-error text-on-error rounded-full px-3 py-1.5 text-xs font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="text-on-surface-variant hover:bg-on-surface/[0.08] rounded-full px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-2"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${brand.name}`}
                      onClick={() => setConfirmingId(brand.id)}
                      className="text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="delete" size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Deleting a brand is not deleting its catalogue, and the count
                  above is the only clue as to how much it touches. */}
              {confirmingId === brand.id && brand.productCount > 0 && (
                <p className="text-on-surface-variant border-outline-variant border-t px-4 py-2 text-xs">
                  {brand.productCount === 1 ? "1 product keeps" : `${brand.productCount} products keep`}{" "}
                  its listing and loses the brand.
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
