"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useProductColor } from "@/components/products/ProductColorContext";
import { addToCart, type CartActionState } from "@/lib/actions/cart";
import { formatPrice } from "@/lib/products/format";
import {
  describeVariant,
  findVariant,
  isValueAvailable,
  variantAxes,
  type VariantView,
} from "@/lib/products/variants";

const INITIAL: CartActionState = {};

/**
 * The buy box.
 *
 * When a product has variants, the configuration is what is actually being
 * bought — so price, stock and the add button all follow the selection rather
 * than the product. When it has none, every variant branch collapses and this
 * behaves exactly as it did before variants existed.
 */
export function AddToCartForm({
  productId,
  slug,
  colors,
  stock,
  priceCents,
  variants,
  secondaryAction,
}: {
  productId: string;
  slug: string;
  colors: { name: string; hex: string }[];
  /** Product-level stock, used only when there are no variants. */
  stock: number;
  /** Product-level price, used only when there are no variants. */
  priceCents: number;
  variants: VariantView[];
  /**
   * Rendered beside the submit button, on the same row.
   *
   * A slot rather than the caller stacking something underneath, because "next
   * to Add to cart" is a position only this component can offer — the submit
   * button is the last thing in a form the page cannot reach into. The product
   * page passes the WhatsApp button; anywhere that passes nothing gets the
   * button on its own exactly as before.
   */
  secondaryAction?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(addToCart, INITIAL);

  // The cart line stores the colour's name; the hex rides along so the line
  // can still draw its swatch after the product's colourways change.
  //
  // Shared with the gallery through the provider when there is one, so this
  // picker also swaps the photos. `local` is the fallback for the surfaces that
  // render this form without a provider around it.
  const shared = useProductColor();
  const [local, setLocal] = useState(colors[0]?.name ?? "");
  const color = shared ? (shared.selected?.name ?? "") : local;
  const setColor = shared ? shared.select : setLocal;
  const selectedColor = colors.find((c) => c.name === color) ?? null;
  const [quantity, setQuantity] = useState(1);

  const axes = variantAxes(variants);

  // Opens on the cheapest configuration that is actually in stock, falling
  // back to the cheapest overall — arriving on a sold-out default would read
  // as the whole product being unavailable.
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    if (variants.length === 0) return {};
    const candidates = variants.filter((variant) => variant.stock > 0);
    const opening = [...(candidates.length > 0 ? candidates : variants)].sort(
      (a, b) => a.priceCents - b.priceCents,
    )[0];
    return Object.fromEntries(
      opening.options.map((option) => [option.definitionId, option.valueKey]),
    );
  });

  const variant = variants.length > 0 ? findVariant(variants, selection) : null;

  // A combination the shop does not sell leaves nothing to price or buy, which
  // is a real state the UI has to show rather than paper over.
  const unsoldCombination = variants.length > 0 && !variant;

  const effectivePrice = variant?.priceCents ?? priceCents;
  const effectiveStock = variant?.stock ?? (variants.length > 0 ? 0 : stock);
  const soldOut = effectiveStock === 0;
  const max = Math.min(effectiveStock, 99);

  const pick = (definitionId: string, valueKey: string) => {
    setSelection((current) => ({ ...current, [definitionId]: valueKey }));
    setQuantity(1);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="colorHex" value={selectedColor?.hex ?? ""} />
      <input type="hidden" name="quantity" value={quantity} />
      {/* The id, not the selection: the server re-reads the variant to price
          it, so a tampered form cannot buy a configuration at another's
          price. */}
      <input type="hidden" name="variantId" value={variant?.id ?? ""} />

      {state.message && (
        <p
          role="alert"
          className="bg-error-container text-on-error-container flex items-center gap-2 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={18} />
          {state.message}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-center gap-2 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="check_circle" size={18} />
          {state.success}
        </p>
      )}

      {axes.map((axis) => (
        <div key={axis.definitionId}>
          <p className="text-on-surface-variant mb-2 text-sm">
            {axis.label}:{" "}
            <span className="text-on-surface font-medium">
              {axis.values.find((v) => v.valueKey === selection[axis.definitionId])
                ?.display ?? "—"}
            </span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const active = selection[axis.definitionId] === value.valueKey;
              // Not sold in combination with the rest of the selection.
              const reachable = isValueAvailable(
                variants,
                selection,
                axis.definitionId,
                value.valueKey,
              );

              return (
                <li key={value.valueKey}>
                  <button
                    type="button"
                    onClick={() => pick(axis.definitionId, value.valueKey)}
                    aria-pressed={active}
                    // Still selectable when unreachable: it re-anchors the
                    // selection onto a combination that does exist, which is
                    // more useful than a dead control.
                    className={cn(
                      "h-10 rounded-full border px-4 text-sm font-medium transition-all duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
                      active
                        ? "border-primary bg-primary/[0.08] text-on-surface"
                        : "border-outline-variant text-on-surface-variant hover:bg-on-surface/[0.06]",
                      !reachable && !active && "line-through opacity-40",
                    )}
                  >
                    {value.display}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Price restated here rather than only in the header, because with
          variants it is a consequence of the selection above. */}
      {variants.length > 0 && (
        <p className="text-on-surface text-headline-sm" aria-live="polite">
          {unsoldCombination ? (
            <span className="text-on-surface-variant text-base">
              That combination is not sold — pick another.
            </span>
          ) : (
            <>
              {formatPrice(effectivePrice)}
              <span className="text-on-surface-variant ml-3 text-sm">
                {soldOut ? "Sold out" : `${effectiveStock} in stock`}
                {variant?.sku ? ` · ${variant.sku}` : ""}
              </span>
            </>
          )}
        </p>
      )}

      {colors.length > 0 && (
        <div>
          <p className="text-on-surface-variant mb-2 text-sm">
            Colour: <span className="text-on-surface font-medium">{color}</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {colors.map((value) => (
              <li key={value.name}>
                <button
                  type="button"
                  onClick={() => setColor(value.name)}
                  title={value.name}
                  // Says what it now actually does — the photos change too.
                  // Distinct from the gallery's "Show image N", so the two
                  // controls are tellable apart by name alone.
                  aria-label={`Show the ${value.name} finish`}
                  aria-pressed={value.name === color}
                  className={cn(
                    // The ring grows on touch while the swatch inside stays the
                    // same size: the colour is what is being read, and enlarging
                    // it would change how the finish looks rather than just how
                    // easy it is to hit.
                    "grid size-9 place-items-center rounded-full border-2 transition-all duration-200 pointer-coarse:size-11",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
                    value.name === color ? "border-primary" : "border-outline-variant",
                  )}
                >
                  <span
                    className="border-outline-variant/40 size-6 rounded-full border"
                    style={{ backgroundColor: value.hex }}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!soldOut && !unsoldCombination && (
        <div className="flex items-center gap-3">
          <span className="text-on-surface-variant text-sm">Quantity</span>
          <div className="border-outline-variant flex items-center rounded-full border">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="text-on-surface-variant grid size-9 place-items-center rounded-full transition-colors duration-200 pointer-coarse:size-11 hover:bg-on-surface/[0.08] disabled:opacity-40 focus-visible:outline-2"
            >
              <Icon name="remove" size={18} />
            </button>
            <span
              aria-live="polite"
              className="text-on-surface w-8 text-center text-sm tabular-nums"
            >
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => Math.min(max, q + 1))}
              disabled={quantity >= max}
              className="text-on-surface-variant grid size-9 place-items-center rounded-full transition-colors duration-200 pointer-coarse:size-11 hover:bg-on-surface/[0.08] disabled:opacity-40 focus-visible:outline-2"
            >
              <Icon name="add" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* `items-start`, not `items-center`: the WhatsApp button is a column
          carrying an optional availability note under it, and centring would
          lift its anchor out of line with Add to cart by half the note's
          height. Aligned at the top, the two buttons agree and the note hangs
          below where it belongs.

          `flex-wrap` so a narrow column stacks them rather than shrinking two
          buttons until neither reads. */}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          type="submit"
          icon="shopping_cart"
          loading={pending}
          disabled={soldOut || unsoldCombination}
        >
          {unsoldCombination
            ? "Unavailable"
            : soldOut
              ? "Sold out"
              : pending
                ? "Adding…"
                : "Add to cart"}
        </Button>

        {secondaryAction}
      </div>

      {variant && (
        <p className="text-on-surface-variant text-xs">
          Adding: {describeVariant(variant)}
        </p>
      )}
    </form>
  );
}
