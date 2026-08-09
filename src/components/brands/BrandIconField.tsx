"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/brands/BrandIcon";
import { cn } from "@/lib/cn";
import { MAX_SVG_INPUT_BYTES, sanitizeSvg } from "@/lib/brands/svg";
import { useFileDrop } from "@/lib/hooks/useFileDrop";

/**
 * Brand mark picker: drop an .svg, choose a file, or paste markup.
 *
 * The preview runs the *same* sanitizer the server will run on save — the
 * module is plain TypeScript with no DOM or Node dependency, so it loads in
 * the browser unchanged. That means what is previewed is byte-for-byte what
 * gets stored, and a rejected icon says why before the form is ever submitted,
 * rather than after a round trip.
 *
 * It is a preview, not a check. The server sanitizes again on save, because
 * anything decided in the browser is a suggestion.
 */
export function BrandIconField({
  name,
  value,
  onChange,
  error,
}: {
  name: string;
  /** Raw markup — the sanitizer normalizes it, so it need not be clean. */
  value: string;
  onChange: (value: string) => void;
  /** Server-side error from the last submit. */
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();

  // Cheap enough to run on every keystroke: a logo is a few kilobytes and the
  // sanitizer is a single pass over it.
  const preview = useMemo(
    () => (value.trim() ? sanitizeSvg(value) : null),
    [value],
  );

  const read = (file: File) => {
    setReadError(null);

    if (file.size > MAX_SVG_INPUT_BYTES) {
      setReadError("That file is too large to be an icon.");
      return;
    }

    // Checked before reading, but not trusted: `type` is whatever the OS
    // guessed, so the sanitizer is still what decides.
    if (file.type && file.type !== "image/svg+xml" && !file.name.endsWith(".svg")) {
      setReadError("Choose an .svg file — raster images cannot be used as marks.");
      return;
    }

    startReading(async () => {
      try {
        onChange(await file.text());
      } catch {
        setReadError("That file could not be read.");
      }
    });
  };

  const problem = readError ?? (preview && !preview.ok ? preview.error : null) ?? error;

  // No `onUrl` here, unlike the photo fields: this stores the vector's markup,
  // not a link to it, so an address dragged from another tab is of no use — and
  // refusing it outright is kinder than lighting the target up for a drop that
  // could never work.
  const { dragging, dropProps } = useFileDrop({ onFiles: (files) => read(files[0]) });

  return (
    <div className="space-y-3">
      <div
        {...dropProps}
        className={cn(
          "rounded-xl border-2 border-dashed p-4 transition-colors duration-200",
          dragging ? "border-primary bg-primary/[0.06]" : "border-outline-variant",
        )}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* Shown on two surfaces, because a mark that inherits currentColor
              looks completely different on each — and the whole point of
              storing vectors is that one file serves both themes. */}
          <div className="flex shrink-0 gap-2">
            <div className="bg-surface-container-highest text-on-surface grid size-16 place-items-center rounded-lg">
              {preview?.ok ? (
                <BrandIcon svg={preview.svg} size={36} />
              ) : (
                <Icon name="hide_image" size={24} className="text-on-surface-variant" />
              )}
            </div>
            <div className="bg-inverse-surface text-inverse-on-surface grid size-16 place-items-center rounded-lg">
              {preview?.ok ? (
                <BrandIcon svg={preview.svg} size={36} />
              ) : (
                <Icon name="hide_image" size={24} className="opacity-60" />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">Brand mark</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">
              Drop an SVG here, choose a file, or paste the markup below. An icon
              with no fill of its own takes the colour of the text beside it.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={reading}
                className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
              >
                <Icon name="upload" size={18} />
                {reading ? "Reading…" : "Choose SVG"}
              </button>

              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setReadError(null);
                  }}
                  className="text-on-surface-variant state-layer inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Icon name="close" size={18} />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/svg+xml,.svg"
          className="sr-only"
          aria-label="Upload brand mark"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) read(file);
            // Reset so re-picking the same file fires change again.
            event.target.value = "";
          }}
        />
      </div>

      <div>
        <label
          htmlFor={`${name}-source`}
          className="text-on-surface-variant px-1 text-xs"
        >
          SVG markup
        </label>
        <textarea
          id={`${name}-source`}
          name={name}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setReadError(null);
          }}
          rows={6}
          spellCheck={false}
          placeholder={'<svg viewBox="0 0 24 24">…</svg>'}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${name}-status`}
          className={cn(
            "mt-1 w-full rounded-sm border bg-transparent p-3 font-mono text-xs",
            "text-on-surface caret-primary",
            "transition-colors duration-200 focus:border-2 focus:outline-none",
            problem
              ? "border-error focus:border-error"
              : "border-outline focus:border-primary",
          )}
        />

        <p
          id={`${name}-status`}
          role={problem ? "alert" : undefined}
          className={cn(
            "mt-1 px-1 text-xs",
            problem ? "text-error" : "text-on-surface-variant",
          )}
        >
          {problem ??
            (preview?.ok
              ? `Cleaned and ready — viewBox ${preview.viewBox}.`
              : "Optional. Scripts, embedded images and external references are removed on save.")}
        </p>
      </div>
    </div>
  );
}
