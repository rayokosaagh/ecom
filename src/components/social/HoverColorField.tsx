"use client";

import { useId } from "react";

import { Icon } from "@/components/ui/Icon";
import { normalizeHexColor, readableOn } from "@/lib/social/color";
import { cn } from "@/lib/cn";

/**
 * The hover-colour picker for one social link.
 *
 * A native `<input type="color">` for the swatch and a text input for the hex,
 * bound to the same value. Both because neither alone is enough: the swatch is
 * how you *find* a colour and gives platform pickers and eyedroppers for free,
 * and the text field is how you paste the exact brand hex a marketing team
 * handed you.
 *
 * The colour input is the one that carries `name`, so a browser that cannot
 * render the text field still submits something valid. The text field is
 * deliberately nameless — two inputs with one name would submit twice and
 * `formData.get` would read whichever came first.
 *
 * The preview is a real chip in the real hover colours rather than a swatch,
 * because the question being answered is "is the icon still readable on that?"
 * — and the contrast pairing is computed, so the answer is not obvious from the
 * hex alone.
 */
export function HoverColorField({
  name,
  value,
  onChange,
  onReset,
  /** Where "reset" goes back to, for naming the button. */
  platformName,
  isDefault,
  error,
  children,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  platformName: string;
  isDefault: boolean;
  error?: string;
  /** The mark, drawn into the preview chip. */
  children: React.ReactNode;
}) {
  const id = useId();
  const describedById = `${id}-description`;

  // The text field accepts half-typed input — "#e44" is three characters into
  // a six-character colour, not a mistake — so the swatch holds the last value
  // that actually parsed rather than flickering to black mid-keystroke.
  const parsed = normalizeHexColor(value);
  const preview = parsed ?? "#000000";

  return (
    <div>
      <span className="text-on-surface text-sm font-medium">Hover colour</span>
      <p id={describedById} className="text-on-surface-variant mt-0.5 text-xs">
        What the icon lights up to when a shopper points at it. The mark&apos;s
        own colour is picked for contrast, so it stays readable on anything.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* The chip exactly as the home page draws it on hover. */}
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full transition-colors duration-200"
          style={{ backgroundColor: preview, color: readableOn(preview) }}
        >
          {children}
        </span>

        <label className="sr-only" htmlFor={id}>
          Hover colour
        </label>
        <input
          id={id}
          name={name}
          type="color"
          value={preview}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedById}
          className="border-outline size-12 shrink-0 cursor-pointer rounded-full border bg-transparent p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
        />

        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-label="Hover colour, as a hex code"
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-12 w-32 rounded-sm border bg-transparent px-3 font-mono text-sm",
            "text-on-surface caret-primary focus:border-2 focus:outline-none",
            error ? "border-error focus:border-error" : "border-outline focus:border-primary",
          )}
        />

        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="text-primary state-layer inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        >
          <Icon name="restart_alt" size={18} />
          {/* Named, so the button says what it will do rather than only that
              it will undo something. */}
          {platformName}&apos;s colour
        </button>
      </div>

      {error && <p className="text-error mt-1 text-xs">{error}</p>}
    </div>
  );
}
