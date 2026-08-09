"use client";

import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  supportingText?: string;
}

/**
 * M3 outlined select built on a native <select>, so it keeps platform keyboard
 * behaviour and mobile pickers for free. The label always floats — unlike a
 * text input, a select is never visually empty.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, supportingText, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedById = `${fieldId}-description`;
  const hasError = Boolean(error);

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={error || supportingText ? describedById : undefined}
          className={cn(
            "h-14 w-full appearance-none rounded-sm border bg-transparent px-4 pt-4 text-base",
            "text-on-surface",
            "transition-colors duration-200 ease-[var(--ease-standard)]",
            "focus:border-2 focus:outline-none",
            hasError ? "border-error focus:border-error" : "border-outline focus:border-primary",
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label
          htmlFor={fieldId}
          className={cn(
            "bg-surface pointer-events-none absolute -top-2 left-4 px-1 text-xs",
            hasError ? "text-error" : "text-on-surface-variant",
          )}
        >
          {label}
          {required && <span aria-hidden> *</span>}
        </label>

        <Icon
          name="expand_more"
          size={20}
          className="text-on-surface-variant pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </div>

      {(error || supportingText) && (
        <p
          id={describedById}
          className={cn("mt-1 px-4 text-xs", hasError ? "text-error" : "text-on-surface-variant")}
        >
          {error ?? supportingText}
        </p>
      )}
    </div>
  );
});
