import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Page control for the catalogue and the sale listing.
 *
 * Plain links, so it needs no client JavaScript: every page is a real URL that
 * can be shared, bookmarked and reached by the back button — the same principle
 * the filter toolbar follows.
 *
 * `hrefFor` is supplied by the page because each one carries a different set of
 * query params it must preserve, and a callback cannot cross the server/client
 * boundary — the same reason the facet links are built server-side.
 */
export function Pagination({
  currentPage,
  totalPages,
  hrefFor,
  className,
}: {
  currentPage: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  // One page is not a choice, and a control offering it is noise.
  if (totalPages <= 1) return null;

  const pages = pageWindow(currentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("mt-8 flex flex-wrap items-center justify-center gap-2", className)}
    >
      <PageArrow
        href={currentPage > 1 ? hrefFor(currentPage - 1) : null}
        label="Previous page"
        icon="chevron_left"
      />

      {pages.map((page, index) =>
        page === null ? (
          // Not a link and not focusable: it stands for pages that exist, but
          // it is punctuation, not a destination.
          <span
            key={`gap-${index}`}
            aria-hidden
            className="text-on-surface-variant px-1 text-sm"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={hrefFor(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
            className={cn(
              "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-medium",
              "transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
              page === currentPage
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-on-surface/[0.06]",
            )}
          >
            {page}
          </Link>
        ),
      )}

      <PageArrow
        href={currentPage < totalPages ? hrefFor(currentPage + 1) : null}
        label="Next page"
        icon="chevron_right"
      />
    </nav>
  );
}

/**
 * Previous/next.
 *
 * At the ends it renders a disabled `span` rather than a link to nowhere: an
 * anchor with no href is not focusable and announces as nothing, and one that
 * points at the current page is a lie about what clicking it does.
 */
function PageArrow({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: string;
}) {
  const shape =
    "grid h-10 w-10 place-items-center rounded-full transition-colors duration-200";

  if (!href) {
    return (
      <span aria-hidden className={cn(shape, "text-on-surface/[0.38]")}>
        <Icon name={icon} size={20} />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        shape,
        "text-on-surface-variant hover:bg-on-surface/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      <Icon name={icon} size={20} />
    </Link>
  );
}

/**
 * Which page numbers to show, with `null` standing for a gap.
 *
 * Always first and last, always the current page and its neighbours. The width
 * is fixed so the control does not resize as it is used — a row of numbers that
 * reflows under the cursor is how you click the wrong one.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_unused, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  /**
   * Near an end there is no gap on that side, so the slot it would have taken
   * goes to a real number instead.
   *
   * **Four**, not three. Three was the first attempt and it made the control
   * six slots wide at the ends against seven in the middle — so paging from 1
   * to 5 grew the row and shifted every number under the cursor. The middle
   * spends two slots on gaps and the ends only one, so the ends need one extra
   * number to come out level. `check:pagination` asserts the width is constant.
   */
  if (current <= 3) {
    pages.add(2).add(3).add(4).add(5);
  } else if (current >= total - 2) {
    pages.add(total - 1).add(total - 2).add(total - 3).add(total - 4);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const withGaps: (number | null)[] = [];
  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) withGaps.push(null);
    withGaps.push(page);
  }

  return withGaps;
}
