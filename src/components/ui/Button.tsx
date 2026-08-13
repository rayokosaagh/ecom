"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

type Variant = "filled" | "tonal" | "outlined" | "text" | "elevated";

const VARIANTS: Record<Variant, string> = {
  filled: "bg-primary text-on-primary shadow-none hover:shadow-elevation-1",
  tonal:
    "bg-secondary-container text-on-secondary-container hover:shadow-elevation-1",
  outlined:
    "border border-outline text-primary bg-transparent hover:bg-primary/[0.04]",
  text: "text-primary bg-transparent hover:bg-primary/[0.04]",
  elevated:
    "bg-surface-container-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Material Symbols ligature name, e.g. "add" or "login". */
  icon?: string;
  /** Renders a spinner and blocks interaction. */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * M3 common button. Height 40px, pill radius, label in a medium weight.
 * Press feedback comes from the shared `.state-layer` overlay rather than a
 * per-variant hover colour, matching how M3 defines state layers.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "filled",
      icon,
      loading = false,
      fullWidth = false,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "state-layer inline-flex h-10 items-center justify-center gap-2 rounded-full px-6",
          "text-label-lg",
          "transition-all duration-200 ease-standard",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "active:scale-[0.98]",
          "disabled:pointer-events-none disabled:bg-on-surface/[0.12] disabled:text-on-surface/[0.38]",
          "disabled:border-transparent disabled:shadow-none",
          VARIANTS[variant],
          fullWidth && "w-full",
          // Icon-leading buttons get a tighter leading edge per the M3 spec.
          (icon || loading) && "pl-4",
          className,
        )}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden
            className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : icon ? (
          <Icon name={icon} size={18} />
        ) : null}
        {children}
      </button>
    );
  },
);
