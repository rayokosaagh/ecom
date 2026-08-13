"use client";

import { useId } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { MAX_VARIANTS } from "@/lib/products/variants";
import { MAX_SPEC_LABEL_LENGTH, MAX_SPEC_VALUE_LENGTH } from "@/lib/specs/keys";

export interface VariantRow {
  /** One value per axis, index-aligned with `axes`. */
  values: string[];
  price: string;
  /** Empty when this configuration is not on sale. */
  compareAtPrice: string;
  stock: string;
  sku: string;
}

const BLANK_INPUT = "h-11 w-full rounded-sm border border-outline bg-transparent px-3 text-sm text-on-surface caret-primary transition-colors duration-200 focus:border-2 focus:border-primary focus:outline-none";

/**
 * Variant grid editor.
 *
 * Two levels: the axes a product varies along, then one row per configuration
 * actually sold. Rows are entered rather than generated from the cartesian
 * product of the axes, because not every combination exists — a 64 GB machine
 * may only be sold with the larger disk, and offering the pair anyway would
 * invent stock that cannot be shipped.
 *
 * Values post under a single repeated `variantValue` field in row-major order;
 * the parser re-splits them by the axis count. Adding or removing an axis
 * rewrites every row here so the grid stays rectangular, which is what makes
 * that safe.
 */
export function VariantField({
  axes,
  rows,
  onAxesChange,
  onRowsChange,
  knownLabels,
  error,
}: {
  axes: string[];
  rows: VariantRow[];
  onAxesChange: (axes: string[]) => void;
  onRowsChange: (rows: VariantRow[]) => void;
  /** Spec labels already in use, offered as suggestions. */
  knownLabels: string[];
  error?: string;
}) {
  const listId = useId();

  const setAxis = (index: number, label: string) => {
    onAxesChange(axes.map((axis, i) => (i === index ? label : axis)));
  };

  const addAxis = () => {
    onAxesChange([...axes, ""]);
    // Keep every row rectangular — a short row would shift the row-major
    // split and silently reassign values to the wrong axis.
    onRowsChange(rows.map((row) => ({ ...row, values: [...row.values, ""] })));
  };

  const removeAxis = (index: number) => {
    const nextAxes = axes.filter((_, i) => i !== index);
    const nextRows = rows.map((row) => ({
      ...row,
      values: row.values.filter((_, i) => i !== index),
    }));
    // Dropping the last axis leaves configurations with nothing to configure.
    onAxesChange(nextAxes);
    onRowsChange(nextAxes.length === 0 ? [] : nextRows);
  };

  const addRow = () =>
    onRowsChange([
      ...rows,
      { values: axes.map(() => ""), price: "", compareAtPrice: "", stock: "0", sku: "" },
    ]);

  const setRow = (index: number, patch: Partial<VariantRow>) =>
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const setValue = (rowIndex: number, axisIndex: number, value: string) =>
    onRowsChange(
      rows.map((row, i) =>
        i === rowIndex
          ? { ...row, values: row.values.map((v, j) => (j === axisIndex ? value : v)) }
          : row,
      ),
    );

  const removeRow = (index: number) =>
    onRowsChange(rows.filter((_, i) => i !== index));

  const namedAxes = axes.filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-on-surface text-sm font-medium">Variants</p>
        <p className="text-on-surface-variant text-xs">
          Leave empty for a product sold one way — it then uses the price and
          stock above. Adding variants moves both onto each configuration.
        </p>
      </div>

      <datalist id={listId}>
        {knownLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {/* Axes ---------------------------------------------------------- */}
      <div className="space-y-2">
        <p className="label-caps text-on-surface-variant">
          Varies by
        </p>
        <ul className="flex flex-wrap gap-2">
          {axes.map((axis, index) => (
            <li key={index} className="flex items-center gap-1">
              <input
                type="text"
                name="variantAxis"
                value={axis}
                onChange={(event) => setAxis(index, event.target.value)}
                list={listId}
                placeholder="RAM"
                maxLength={MAX_SPEC_LABEL_LENGTH}
                aria-label={`Variant axis ${index + 1}`}
                className={cn(BLANK_INPUT, "w-40")}
              />
              <button
                type="button"
                onClick={() => removeAxis(index)}
                aria-label={`Remove axis ${axis || index + 1}`}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2"
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addAxis}
          className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          {axes.length === 0 ? "Add an axis" : "Add another axis"}
        </button>
      </div>

      {/* Configurations ------------------------------------------------ */}
      {namedAxes > 0 && (
        <div className="space-y-2">
          <p className="label-caps text-on-surface-variant">
            Configurations sold
          </p>

          {rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((row, rowIndex) => (
                <li key={rowIndex} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr_6rem_6rem_5rem_7rem]">
                    {axes.map((axis, axisIndex) => (
                      <input
                        key={axisIndex}
                        type="text"
                        name="variantValue"
                        value={row.values[axisIndex] ?? ""}
                        onChange={(event) =>
                          setValue(rowIndex, axisIndex, event.target.value)
                        }
                        placeholder={axis || `Value ${axisIndex + 1}`}
                        maxLength={MAX_SPEC_VALUE_LENGTH}
                        aria-label={`${axis || `Axis ${axisIndex + 1}`} for variant ${rowIndex + 1}`}
                        className={BLANK_INPUT}
                      />
                    ))}

                    <input
                      type="text"
                      inputMode="decimal"
                      name="variantPrice"
                      value={row.price}
                      onChange={(event) => setRow(rowIndex, { price: event.target.value })}
                      placeholder="Price"
                      aria-label={`Price for variant ${rowIndex + 1}`}
                      className={BLANK_INPUT}
                    />
                    {/* Blank means this configuration is not reduced. A row can
                        be on sale while its neighbours are not — that is the
                        point of pricing per configuration. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      name="variantCompareAt"
                      value={row.compareAtPrice}
                      onChange={(event) =>
                        setRow(rowIndex, { compareAtPrice: event.target.value })
                      }
                      placeholder="Was"
                      aria-label={`Previous price for variant ${rowIndex + 1}, leave empty if not on sale`}
                      className={BLANK_INPUT}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      name="variantStock"
                      value={row.stock}
                      onChange={(event) => setRow(rowIndex, { stock: event.target.value })}
                      placeholder="Stock"
                      aria-label={`Stock for variant ${rowIndex + 1}`}
                      className={BLANK_INPUT}
                    />
                    <input
                      type="text"
                      name="variantSku"
                      value={row.sku}
                      onChange={(event) => setRow(rowIndex, { sku: event.target.value })}
                      placeholder="SKU"
                      aria-label={`SKU for variant ${rowIndex + 1}`}
                      className={BLANK_INPUT}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    aria-label={`Remove variant ${rowIndex + 1}`}
                    className="text-on-surface-variant hover:bg-on-surface/[0.08] mt-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {rows.length < MAX_VARIANTS && (
            <button
              type="button"
              onClick={addRow}
              className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              <Icon name="add" size={18} />
              {rows.length === 0 ? "Add a configuration" : "Add another"}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-error px-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
