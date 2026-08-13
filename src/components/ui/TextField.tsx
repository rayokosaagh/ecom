"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  /** Shown below the field; replaced by `error` when present. */
  supportingText?: string;
  error?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  onTrailingIconClick?: () => void;
}

/**
 * M3 outlined text field with a floating label.
 *
 * The label sits inside the field at rest and rises into the top border when
 * focused or filled. The "notch" is faked by giving the floated label the same
 * background as the surface behind it — far less markup than M3's real notched
 * outline, and visually identical on a flat background.
 *
 * `peer-placeholder-shown` drives the filled state, which is why the input
 * carries a single-space placeholder: an empty placeholder never matches.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      supportingText,
      error,
      leadingIcon,
      trailingIcon,
      onTrailingIconClick,
      className,
      id,
      required,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedById = `${inputId}-description`;
    const hasError = Boolean(error);

    return (
      <div className={cn("w-full", className)}>
        <div className="relative">
          {leadingIcon && (
            <Icon
              name={leadingIcon}
              size={20}
              className={cn(
                "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2",
                hasError ? "text-error" : "text-on-surface-variant",
              )}
            />
          )}

          <input
            ref={ref}
            id={inputId}
            required={required}
            placeholder=" "
            aria-invalid={hasError || undefined}
            aria-describedby={error || supportingText ? describedById : undefined}
            className={cn(
              "peer h-14 w-full rounded-sm border bg-transparent px-4 pt-4 text-base",
              "text-on-surface caret-primary",
              "transition-colors duration-200 ease-standard",
              "focus:border-2 focus:outline-none",
              "disabled:text-on-surface/[0.38] disabled:border-on-surface/[0.12]",
              leadingIcon && "pl-11",
              trailingIcon && "pr-11",
              hasError
                ? "border-error focus:border-error"
                : "border-outline focus:border-primary",
            )}
            {...props}
          />

          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute left-4 px-1",
              "bg-surface",
              "transition-all duration-200 ease-standard",
              // Floated (default) position: sitting on the top border.
              "-top-2 text-xs",
              // Resting position, only while empty and unfocused.
              "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2",
              "peer-placeholder-shown:text-base",
              "peer-focus:-top-2 peer-focus:translate-y-0 peer-focus:text-xs",
              leadingIcon && "peer-placeholder-shown:left-11 peer-focus:left-4",
              hasError
                ? "text-error"
                : "text-on-surface-variant peer-focus:text-primary",
            )}
          >
            {label}
            {required && <span aria-hidden> *</span>}
          </label>

          {trailingIcon &&
            (onTrailingIconClick ? (
              <button
                type="button"
                onClick={onTrailingIconClick}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full transition-colors duration-200"
              >
                <Icon name={trailingIcon} size={20} />
              </button>
            ) : (
              <Icon
                name={trailingIcon}
                size={20}
                className={cn(
                  "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2",
                  hasError ? "text-error" : "text-on-surface-variant",
                )}
              />
            ))}
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
