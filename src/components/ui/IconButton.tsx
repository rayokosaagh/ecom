"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

type Variant = "standard" | "filled" | "tonal" | "outlined";

const VARIANTS: Record<Variant, string> = {
  standard: "text-on-surface-variant",
  filled: "bg-primary text-on-primary",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline text-on-surface-variant",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required — an icon alone gives assistive tech nothing to announce. */
  label: string;
  variant?: Variant;
  size?: number;
  filledIcon?: boolean;
}

/**
 * Circular 40px icon button with an M3 state-layer hover.
 *
 * **Do not pass a `position` utility through `className`.** `state-layer` sets
 * `position: relative` — its `::after` overlay needs a positioning context —
 * and `cn` is a plain joiner rather than tailwind-merge, so an `absolute` here
 * does not replace it. Both land on the element and source order decides;
 * `.state-layer` is emitted after Tailwind's utilities, so `relative` wins and
 * the button silently stays in flow. Put the position on a wrapper instead, as
 * `ScrollRail` does.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = "standard",
      size = 24,
      filledIcon = false,
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "state-layer grid size-10 shrink-0 place-items-center rounded-full",
          "transition-all duration-200 ease-[var(--ease-standard)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "active:scale-95",
          "disabled:pointer-events-none disabled:text-on-surface/[0.38]",
          VARIANTS[variant],
          className,
        )}
        {...props}
      >
        <Icon name={icon} size={size} filled={filledIcon} />
      </button>
    );
  },
);
