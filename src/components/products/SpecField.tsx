"use client";

import { useId } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  MAX_SPECS,
  MAX_SPEC_LABEL_LENGTH,
  MAX_SPEC_VALUE_LENGTH,
  specLabelKey,
} from "@/lib/specs/keys";

export interface SpecRow {
  label: string;
  value: string;
}

const BLANK: SpecRow = { label: "", value: "" };

/**
 * Repeating spec editor.
 *
 * Each row posts under a repeated field name (`specLabel`, `specValue`), so
 * the two arrays arrive index-aligned on the server with no client-side JSON
 * serialisation — the same shape `ColorField` uses.
 *
 * The label is a free-text input backed by a `<datalist>` of labels already in
 * use rather than a select. A select would force an editor to leave the form
 * to declare a new label before they could fill it in; the datalist suggests
 * the established ones while still accepting a new one, and the server matches
 * whatever is typed to an existing definition by key. Typing "ram" when "RAM"
 * exists reuses it rather than splitting the facet.
 *
 * There is no reordering here on purpose: display order belongs to the label
 * (set from /admin/specs) so every product lists its specs the same way.
 */
export function SpecField({
  value,
  onChange,
  knownLabels,
  error,
}: {
  value: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  /** Labels already defined, offered as suggestions. */
  knownLabels: string[];
  error?: string;
}) {
  const listId = useId();

  const update = (index: number, patch: Partial<SpecRow>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { ...BLANK }]);

  // Duplicates are a server-side error; flagging them as they are typed saves
  // a round trip to find out.
  const keys = value.map((row) => specLabelKey(row.label));
  const duplicated = new Set(
    keys.filter((key, index) => key && keys.indexOf(key) !== index),
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-on-surface text-sm font-medium">Specifications</p>
        <p className="text-on-surface-variant text-xs">
          Shown as a table on the product page. Labels are shared across the
          catalogue — reuse an existing one and shoppers can filter by it.
        </p>
      </div>

      <datalist id={listId}>
        {knownLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li key={index} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div>
                  <input
                    type="text"
                    name="specLabel"
                    value={row.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                    placeholder="Label, e.g. RAM"
                    list={listId}
                    maxLength={MAX_SPEC_LABEL_LENGTH}
                    aria-label={`Spec ${index + 1} label`}
                    aria-invalid={duplicated.has(keys[index]) || undefined}
                    className={cn(
                      "h-11 w-full rounded-sm border bg-transparent px-3 text-sm",
                      "text-on-surface caret-primary",
                      "transition-colors duration-200 focus:border-2 focus:outline-none",
                      duplicated.has(keys[index])
                        ? "border-error focus:border-error"
                        : "border-outline focus:border-primary",
                    )}
                  />
                  {duplicated.has(keys[index]) && (
                    <p className="text-error mt-1 px-1 text-xs">Listed twice</p>
                  )}
                </div>

                <input
                  type="text"
                  name="specValue"
                  value={row.value}
                  onChange={(event) => update(index, { value: event.target.value })}
                  placeholder="Value, e.g. 16"
                  maxLength={MAX_SPEC_VALUE_LENGTH}
                  aria-label={`Spec ${index + 1} value`}
                  className={cn(
                    "border-outline focus:border-primary h-11 w-full rounded-sm border bg-transparent px-3 text-sm",
                    "text-on-surface caret-primary",
                    "transition-colors duration-200 focus:border-2 focus:outline-none",
                  )}
                />
              </div>

              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove spec ${index + 1}`}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] mt-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length < MAX_SPECS && (
        <button
          type="button"
          onClick={add}
          className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          {value.length === 0 ? "Add a spec" : "Add another"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-error px-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
