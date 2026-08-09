import Link from "next/link";

import { cn } from "@/lib/cn";

export interface PillOption {
  /** Empty string is the "All" pill. */
  value: string;
  label: string;
  count?: number;
}

/**
 * A rail of mutually exclusive filters, in the same pill language the
 * storefront uses for brands and categories.
 *
 * Links rather than buttons, and a server component rather than a client one:
 * each pill is a real destination, so it opens in a new tab, copies, and works
 * before any JavaScript has loaded. Every other query param is carried across,
 * so picking a status cannot quietly discard the search that is already in the
 * URL.
 */
export function FilterPills({
  label,
  param,
  basePath,
  options,
  params,
}: {
  label: string;
  param: string;
  basePath: string;
  options: PillOption[];
  /** The page's own resolved `searchParams`. */
  params: Record<string, string | undefined>;
}) {
  const active = params[param] ?? "";

  const hrefFor = (value: string) => {
    const next = new URLSearchParams();
    for (const [key, existing] of Object.entries(params)) {
      if (existing && key !== param) next.set(key, existing);
    }
    if (value) next.set(param, value);

    const search = next.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = active === option.value;
        return (
          <Link
            key={option.value || "all"}
            href={hrefFor(option.value)}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-on-surface/[0.06]",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-1 opacity-60">{option.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
