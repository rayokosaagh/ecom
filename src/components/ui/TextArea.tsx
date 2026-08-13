"use client";

import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  supportingText?: string;
  error?: string;
}

/** M3 outlined text area. Same floating-label mechanics as TextField. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { label, supportingText, error, className, id, required, rows = 4, ...props },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const describedById = `${fieldId}-description`;
    const hasError = Boolean(error);

    return (
      <div className={cn("w-full", className)}>
        <div className="relative">
          <textarea
            ref={ref}
            id={fieldId}
            rows={rows}
            required={required}
            placeholder=" "
            aria-invalid={hasError || undefined}
            aria-describedby={error || supportingText ? describedById : undefined}
            className={cn(
              "peer w-full resize-y rounded-sm border bg-transparent px-4 pt-5 pb-3 text-base",
              "text-on-surface caret-primary",
              "transition-colors duration-200 ease-standard",
              "focus:border-2 focus:outline-none",
              hasError
                ? "border-error focus:border-error"
                : "border-outline focus:border-primary",
            )}
            {...props}
          />

          <label
            htmlFor={fieldId}
            className={cn(
              "bg-surface pointer-events-none absolute left-4 px-1",
              "transition-all duration-200 ease-standard",
              "-top-2 text-xs",
              "peer-placeholder-shown:top-4 peer-placeholder-shown:text-base",
              "peer-focus:-top-2 peer-focus:text-xs",
              hasError ? "text-error" : "text-on-surface-variant peer-focus:text-primary",
            )}
          >
            {label}
            {required && <span aria-hidden> *</span>}
          </label>
        </div>

        {(error || supportingText) && (
          <p
            id={describedById}
            className={cn(
              "mt-1 px-4 text-xs",
              hasError ? "text-error" : "text-on-surface-variant",
            )}
          >
            {error ?? supportingText}
          </p>
        )}
      </div>
    );
  },
);
