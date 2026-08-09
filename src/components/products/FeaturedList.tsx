"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  addFeaturedProduct,
  removeFeaturedProduct,
  reorderFeaturedProducts,
  type FeaturedActionState,
} from "@/lib/actions/featured";

export interface FeaturedRow {
  id: string;
  productId: string;
  name: string;
  image: string | null;
  brand: string | null;
  published: boolean;
}

export interface FeaturableOption {
  id: string;
  name: string;
  published: boolean;
  brand: string | null;
}

const INITIAL: FeaturedActionState = {};

/**
 * The featured list.
 *
 * Order here is the order the home page shows them in, which is the whole
 * point of the page — so the move buttons commit immediately rather than
 * waiting for a save, the same way the banner list behaves.
 */
export function FeaturedList({
  rows,
  options,
}: {
  rows: FeaturedRow[];
  options: FeaturableOption[];
}) {
  const [state, formAction, adding] = useActionState(addFeaturedProduct, INITIAL);
  const [items, setItems] = useState(rows);
  const [pending, startTransition] = useTransition();

  // The server is the source of truth after any mutation revalidates. Adopting
  // new props during render is React's documented way to reset state when an
  // input changes.
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
      await reorderFeaturedProducts(next.map((row) => row.id));
    });
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((row) => row.id !== id));
    startTransition(async () => {
      await removeFeaturedProduct(id);
    });
  };

  return (
    <div className="space-y-6">
      <Card variant="outlined">
        <form action={formAction} className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-64 flex-1">
            <Select
              label="Add a product"
              name="productId"
              placeholder={
                options.length === 0
                  ? "Every product is already featured"
                  : "Choose a product"
              }
              disabled={options.length === 0}
              options={options.map((option) => ({
                value: option.id,
                label: `${option.brand ? `${option.brand} · ` : ""}${option.name}${
                  option.published ? "" : " (draft)"
                }`,
              }))}
            />
          </div>
          <Button type="submit" icon="add" loading={adding} className="mb-0.5">
            Feature it
          </Button>
        </form>

        {state.message && (
          <p role="alert" className="text-error px-4 pb-4 text-sm">
            {state.message}
          </p>
        )}
      </Card>

      <div>
        <p
          className="text-on-surface-variant mb-3 flex h-5 items-center gap-2 text-xs"
          aria-live="polite"
        >
          {pending ? (
            <>
              <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
              Saving…
            </>
          ) : (
            "Order here is the order the home page shows them in."
          )}
        </p>

        <ul className="space-y-3">
          {items.map((row, index) => (
            <li key={row.id}>
              <Card variant="outlined">
                <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <div className="hidden flex-col sm:flex">
                    <button
                      type="button"
                      aria-label={`Move ${row.name} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_up" size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${row.name} down`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
                    >
                      <Icon name="keyboard_arrow_down" size={18} />
                    </button>
                  </div>

                  {row.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={row.image}
                      alt=""
                      className="bg-surface-container-highest size-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="bg-surface-container-highest text-on-surface-variant grid size-14 shrink-0 place-items-center rounded-lg">
                      <Icon name="image" size={22} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface truncate text-sm font-medium">
                      {row.name}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {row.brand && (
                        <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5">
                          {row.brand}
                        </span>
                      )}
                      {/* A draft is featured but invisible — the storefront
                          filters it out, and this is the only place that
                          discrepancy is visible. */}
                      {!row.published && (
                        <span className="bg-error-container text-on-error-container rounded-full px-2 py-0.5">
                          Draft — hidden on the storefront
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/dashboard/products/${row.productId}/edit`}
                      aria-label={`Edit ${row.name}`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>
                    {/* No confirmation: this removes a product from a list, it
                        does not delete anything. */}
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      aria-label={`Remove ${row.name} from the showcase`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
