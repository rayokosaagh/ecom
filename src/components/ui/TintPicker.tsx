"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { TINTS, isHexColor } from "@/lib/tints";

/** Where the colour input starts before anyone has opened it. */
const CUSTOM_SEED = "#0b57d0";

/**
 * A row of background swatches.
 *
 * Radios rather than a `<select>`, and swatches rather than colour names,
 * because the thing being chosen is a colour: a dropdown reading "Meadow" asks
 * an admin to remember what meadow looked like, where a row of chips answers
 * the question by being the answer. The names are still there under each chip
 * for anyone who cannot separate the hues, and they are what the screen reader
 * announces.
 *
 * A real `<fieldset>` of real `<input type="radio">`s, visually hidden rather
 * than replaced with click handlers on divs. That is what buys arrow-key
 * movement between options, the grouped announcement of the legend, and form
 * semantics — all of which a div with an `onClick` would have to reimplement
 * badly.
 *
 * Uncontrolled by design: it reports a choice through `onChange` and takes its
 * current value from `value`, so the same component serves the featured list
 * (which commits immediately) and the banner form (which submits with the rest
 * of the fields).
 */
export function TintPicker({
  name,
  value,
  onChange,
  legend = "Background",
  disabled = false,
  className,
}: {
  /** Radio group name — must be unique per picker on a page. */
  name: string;
  /** The chosen preset id, or null for "not chosen". */
  value: string | null;
  onChange?: (tint: string) => void;
  legend?: string;
  disabled?: boolean;
  className?: string;
}) {
  // The colour the custom swatch is *showing*, which is not the same as the
  // colour that is chosen. Someone can open the picker, land on a preset, and
  // come back — the custom swatch should still be the colour they mixed rather
  // than resetting to the seed every render.
  const [custom, setCustom] = useState(isHexColor(value) ? value : CUSTOM_SEED);
  const customSelected = isHexColor(value);

  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="text-on-surface-variant mb-2 text-xs font-medium tracking-[0.12em] uppercase">
        {legend}
      </legend>

      <div className="flex flex-wrap gap-2">
        {TINTS.map((tint) => {
          const selected = value === tint.id;
          return (
            <label
              key={tint.id}
              className={cn(
                "group/tint flex cursor-pointer flex-col items-center gap-1",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {/* `sr-only` and not `hidden`: a hidden input is removed from the
                  tab order and from the radio group's arrow-key navigation, so
                  the control would be unreachable without a mouse. */}
              <input
                type="radio"
                name={name}
                value={tint.id}
                checked={selected}
                onChange={() => onChange?.(tint.id)}
                className="peer sr-only"
              />

              <span
                aria-hidden
                className={cn(
                  "grid size-9 place-items-center rounded-full ring-1 transition-[box-shadow,transform] duration-[var(--duration-short4)]",
                  tint.swatch,
                  selected
                    ? "ring-primary ring-2"
                    : "ring-outline-variant/60 group-hover/tint:ring-outline",
                  // The ring is on the swatch, so focus has to be visible on it
                  // too — `peer-focus-visible` is what carries the input's focus
                  // out to the thing that is actually drawn.
                  "peer-focus-visible:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2",
                )}
              >
                {selected && (
                  <Icon
                    name="check"
                    size={18}
                    className="text-on-surface drop-shadow-sm"
                  />
                )}
              </span>

              <span
                className={cn(
                  "text-[10px] whitespace-nowrap",
                  selected ? "text-primary font-medium" : "text-on-surface-variant",
                )}
              >
                {tint.label}
              </span>
            </label>
          );
        })}

        {/*
          The custom option, and it stays inside the same radio group.

          The radio is what submits — its value is the hex, so a form posts one
          `tint` field whichever of the seven options is chosen, and no caller
          needs to know that one of them is special. The colour input beside it
          is deliberately unnamed: it is a way to *edit* the radio's value, not
          a second field, and giving it a name would post the colour even when a
          preset is selected.
        */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative">
            <input
              type="radio"
              name={name}
              value={custom}
              checked={customSelected}
              onChange={() => onChange?.(custom)}
              className="peer sr-only"
            />

            <input
              type="color"
              value={custom}
              disabled={disabled}
              aria-label="Custom background colour"
              onChange={(event) => {
                setCustom(event.target.value);
                // Editing the colour is also choosing it. Requiring a second
                // click on the radio would mean picking a colour and watching
                // nothing happen.
                onChange?.(event.target.value);
              }}
              className={cn(
                "size-9 cursor-pointer appearance-none rounded-full bg-transparent p-0 ring-1 transition-[box-shadow] duration-[var(--duration-short4)]",
                // The native control paints its swatch in a wrapper with its
                // own padding and border; without these it renders as a small
                // square inside a grey box rather than as a round chip.
                "[&::-webkit-color-swatch-wrapper]:rounded-full [&::-webkit-color-swatch-wrapper]:p-0",
                "[&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0",
                "[&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0",
                customSelected
                  ? "ring-primary ring-2"
                  : "ring-outline-variant/60 hover:ring-outline",
                "peer-focus-visible:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2",
                disabled && "cursor-not-allowed opacity-50",
              )}
            />

            {customSelected && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <Icon name="check" size={18} className="text-white drop-shadow" />
              </span>
            )}
          </div>

          <span
            className={cn(
              "text-[10px] whitespace-nowrap",
              customSelected ? "text-primary font-medium" : "text-on-surface-variant",
            )}
          >
            {customSelected ? custom : "Custom"}
          </span>
        </div>
      </div>
    </fieldset>
  );
}
