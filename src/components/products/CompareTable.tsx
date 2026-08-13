"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import type { LogoTreatment } from "@/generated/prisma/enums";
import { BrandMark } from "@/components/brands/BrandMark";
import { cn } from "@/lib/cn";
import type { CompareGroup } from "@/lib/products/compare";

export interface CompareHeader {
  slug: string;
  name: string;
  image: string | null;
  brand: {
    name: string;
    iconSvg: string | null;
    logo: string | null;
    /** How dark mode treats a hosted logo. See `lib/brands/logo-format`. */
    logoTreatment?: LogoTreatment | null;
  } | null;
  category: string | null;
  price: string;
  soldOut: boolean;
}

/**
 * The comparison table.
 *
 * A real `<table>` here, unlike the product page's spec list: this genuinely
 * is a grid whose columns carry meaning, and the header association between a
 * value and the product it belongs to is exactly what `<th scope>` exists to
 * express. A definition list could not say which of four columns a cell is in.
 *
 * Differences-only is the default view. Twenty rows of which four differ is
 * the problem the shopper came here with, and answering it immediately is
 * worth more than completeness they can switch on.
 */
export function CompareTable({
  headers,
  groups,
  differences,
}: {
  headers: CompareHeader[];
  groups: CompareGroup[];
  differences: number;
}) {
  const [onlyDifferences, setOnlyDifferences] = useState(true);

  const visible = groups
    .map((group) => ({
      ...group,
      rows: onlyDifferences ? group.rows.filter((row) => row.differs) : group.rows,
    }))
    .filter((group) => group.rows.length > 0);

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-on-surface-variant text-sm" aria-live="polite">
          {differences === 0
            ? "These are identical on every spec they share."
            : `${differences} of ${total} specs differ.`}
        </p>

        <label className="text-on-surface flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => setOnlyDifferences(event.target.checked)}
            className="accent-primary size-4 rounded"
          />
          Differences only
        </label>
      </div>

      <p className="text-on-surface-variant mb-2 flex items-center gap-1.5 text-xs sm:hidden">
        <Icon name="swipe" size={14} />
        Swipe the table to see every product
      </p>

      {/* The table scrolls inside its own box rather than the page: the label
          column is what makes a row readable, and it has to stay put. */}
      <div className="border-outline-variant overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Specifications compared across {headers.length} products
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                className="bg-surface-container-low sticky left-0 z-10 w-28 min-w-28 p-3 text-left align-bottom sm:w-44 sm:min-w-44"
              >
                <span className="sr-only">Specification</span>
              </th>
              {headers.map((header) => (
                <th
                  key={header.slug}
                  scope="col"
                  className="border-outline-variant min-w-40 border-l p-3 text-left align-bottom font-normal sm:min-w-48"
                >
                  <Link
                    href={`/products/${header.slug}`}
                    className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="bg-surface-container-highest mb-2 block aspect-square w-20 overflow-hidden rounded-lg">
                      {header.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={header.image}
                          alt=""
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <span className="text-on-surface-variant grid size-full place-items-center">
                          <Icon name="image" size={24} />
                        </span>
                      )}
                    </span>

                    {header.brand && (
                      <span className="label-caps text-on-surface-variant mb-0.5 flex items-center gap-1.5">
                        {header.brand.iconSvg || header.brand.logo ? (
                          <BrandMark
                            svg={header.brand.iconSvg}
                            logo={header.brand.logo}
                            treatment={header.brand.logoTreatment}
                            size={14}
                            label={header.brand.name}
                          />
                        ) : (
                          <span className="text-on-surface font-medium">
                            {header.brand.name}
                          </span>
                        )}
                      </span>
                    )}

                    <span className="text-on-surface block leading-snug font-medium group-hover:underline">
                      {header.name}
                    </span>
                    <span className="text-on-surface mt-1 block">{header.price}</span>
                    {header.soldOut && (
                      <span className="bg-error-container text-on-error-container mt-1 inline-block rounded-full px-2 py-0.5 text-label-sm">
                        Sold out
                      </span>
                    )}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>

          {visible.map((group) => (
            <tbody key={group.name ?? "__ungrouped"}>
              {group.name && (
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={headers.length + 1}
                    className="bg-surface-container border-outline-variant border-t px-3 py-2 text-left"
                  >
                    <span className="label-caps text-on-surface-variant flex items-center gap-2">
                      {group.icon && (
                        <Icon name={group.icon} size={14} className="text-primary" />
                      )}
                      {group.name}
                    </span>
                  </th>
                </tr>
              )}

              {group.rows.map((row) => (
                <tr key={row.definitionId} className="border-outline-variant border-t">
                  <th
                    scope="row"
                    className="bg-surface-container-low text-on-surface-variant sticky left-0 z-10 w-28 min-w-28 p-3 text-left font-normal sm:w-44 sm:min-w-44"
                  >
                    {row.label}
                  </th>

                  {row.cells.map((cell, index) => (
                    <td
                      key={headers[index]?.slug ?? index}
                      className={cn(
                        "border-outline-variant border-l p-3 align-top",
                        // Only worth marking when it stands out from its
                        // neighbours — with differences-only on, every row
                        // differs and highlighting them all would say nothing.
                        row.differs && !onlyDifferences
                          ? "text-on-surface font-medium"
                          : "text-on-surface",
                        cell.display === "—" && "text-on-surface-variant",
                      )}
                    >
                      {cell.display}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {onlyDifferences && differences === 0 && (
        <p className="text-on-surface-variant mt-4 text-sm">
          Nothing differs — switch off “differences only” to see the full list.
        </p>
      )}
    </div>
  );
}
