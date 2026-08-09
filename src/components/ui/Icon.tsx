import { cn } from "@/lib/cn";

export interface IconProps {
  /** Material Symbols ligature name, e.g. "shopping_cart". */
  name: string;
  size?: number;
  filled?: boolean;
  weight?: 300 | 400 | 500 | 600 | 700;
  className?: string;
}

/**
 * Material Symbols glyph. The font is self-hosted through the `material-symbols`
 * package, so no external stylesheet request is made at runtime.
 */
export function Icon({
  name,
  size = 24,
  filled = false,
  weight = 400,
  className,
}: IconProps) {
  return (
    <span
      aria-hidden
      className={cn("material-symbols-outlined shrink-0 leading-none", className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" ${weight}, "GRAD" 0, "opsz" ${size}`,
      }}
    >
      {name}
    </span>
  );
}
