"use client";

import { useActionState, useState, useTransition } from "react";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  addFlashSaleProduct,
  removeFlashSaleProduct,
  type FlashSaleFormState,
} from "@/lib/actions/flash";

export interface FlashProductRow {
  /** The `FlashSaleItem` id — what removal acts on. */
  id: string;
  name: string;
  image: string | null;
  brand: string | null;
  published: boolean;
  /** What the shop charges for it right now. */
  priceLabel: string;
  /** What it becomes once the sale opens. Null while the sale is running. */
  becomesLabel: string | null;
  /** Its price came from this sale — the discount is live on it now. */
  applied: boolean;
  /** Already at or below what the discount would produce, so nothing is written. */
  noEffect: boolean;
}

export interface FlashProductOption {
  id: string;
  name: string;
  brand: string | null;
  published: boolean;
  priceLabel: string;
}

const INITIAL: FlashSaleFormState = {};

/**
 * The products in a flash sale.
 *
 * Each row states what the shopper will actually be charged, because that is
 * the number the admin is really deciding and the percentage alone does not
 * show it — 20% off an odd figure lands somewhere they cannot predict, and a
 * product that is already cheaper than the sale would make it gets no discount
 * at all. Saying so here beats discovering it on the storefront.
 */
export function FlashSaleProducts({
  saleId,
  rows,
  options,
  live,
}: {
  saleId: string;
  rows: FlashProductRow[];
  options: FlashProductOption[];
  /** Whether the sale is running, which changes what the prices mean. */
  live: boolean;
}) {
  const addAction = addFlashSaleProduct.bind(null, saleId);
  const [state, formAction, adding] = useActionState(addAction, INITIAL);
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

  const remove = (id: string) => {
    setItems((current) => current.filter((row) => row.id !== id));
    startTransition(async () => {
      await removeFlashSaleProduct(id);
    });
  };

  return (
    <div className="space-y-4">
      <Card variant="outlined">
        <form action={formAction} className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-64 flex-1">
            <Select
              label="Add a product"
              name="productId"
              placeholder={
                options.length === 0
                  ? "Nothing left to add"
                  : "Choose a product"
              }
              disabled={options.length === 0}
              options={options.map((option) => ({
                value: option.id,
                label: `${option.brand ? `${option.brand} · ` : ""}${option.name} — ${
                  option.priceLabel
                }${option.published ? "" : " (draft)"}`,
              }))}
            />
          </div>
          <Button type="submit" icon="add" loading={adding} className="mb-0.5">
            Add
          </Button>
        </form>

        {state.message && (
          <p role="alert" className="text-error px-4 pb-4 text-sm">
            {state.message}
          </p>
        )}
      </Card>

      <p
        className="text-on-surface-variant flex h-5 items-center gap-2 text-xs"
        aria-live="polite"
      >
        {pending && (
          <>
            <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
            Re-pricing…
          </>
        )}
      </p>

      {items.length === 0 ? (
        <Card variant="outlined">
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Icon name="bolt" size={32} className="text-on-surface-variant" />
            <p className="text-on-surface text-sm">No products in this sale yet</p>
            <p className="text-on-surface-variant max-w-sm text-xs">
              A sale with nothing in it never appears on the storefront, whatever
              its window says.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li key={row.id}>
              <Card variant="outlined">
                <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <div className="bg-surface-container-highest grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg">
                    {row.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={row.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon
                        name="image"
                        size={20}
                        className="text-on-surface-variant"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface truncate text-sm font-medium">
                      {row.brand ? `${row.brand} · ` : ""}
                      {row.name}
                    </p>

                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {row.noEffect ? (
                        /* Called out rather than shown as a price change of
                           zero: the admin picked this product expecting a
                           discount, and it is not going to get one. */
                        <span className="bg-error-container text-on-error-container rounded-full px-2 py-0.5">
                          Already cheaper — no discount
                        </span>
                      ) : row.applied ? (
                        <span className="bg-tertiary-container text-on-tertiary-container rounded-full px-2 py-0.5">
                          Now {row.priceLabel}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">
                          {row.priceLabel}
                          <Icon
                            name="arrow_forward"
                            size={12}
                            className="mx-1 inline align-[-1px]"
                          />
                          <span className="text-on-surface font-medium">
                            {row.becomesLabel}
                          </span>
                        </span>
                      )}

                      {!row.published && (
                        <span className="text-on-surface-variant">
                          Draft — hidden from the storefront
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${row.name} from this sale`}
                    title={
                      live
                        ? "Remove, and put this product's price back"
                        : "Remove from this sale"
                    }
                    onClick={() => remove(row.id)}
                    className="text-error hover:bg-error/[0.08] grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
