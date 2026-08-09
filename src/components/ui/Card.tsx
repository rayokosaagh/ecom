import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "elevated" | "filled" | "outlined";

const VARIANTS: Record<Variant, string> = {
  elevated: "bg-surface-container-low shadow-elevation-1",
  filled: "bg-surface-container-highest",
  outlined: "bg-surface border border-outline-variant",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Raises elevation on hover — only for cards that are themselves clickable. */
  interactive?: boolean;
}

/** M3 card: 12px radius, surface-container background, optional elevation lift. */
export function Card({
  variant = "elevated",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl transition-shadow duration-200 ease-[var(--ease-standard)]",
        VARIANTS[variant],
        interactive &&
          "state-layer cursor-pointer hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pt-6 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-on-surface text-xl font-normal tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-on-surface-variant mt-1 text-sm", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}

export function CardActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 px-6 pt-2 pb-6", className)} {...props} />
  );
}
