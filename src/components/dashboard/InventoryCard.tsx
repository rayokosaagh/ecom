import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { LOW_STOCK_THRESHOLD, type AttentionLine } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/cn";

/**
 * The one card that is about the future rather than the past.
 *
 * Everything else on the overview reports what happened; this is a worklist. So
 * it is a list, not a chart — five product names an admin can act on beat a
 * distribution of stock levels they cannot.
 *
 * Out of stock and merely low are separated rather than shaded, because they
 * are different jobs: one is a listing currently losing sales, the other is a
 * reorder to schedule.
 */
export function InventoryCard({
  lowStock,
  outOfStock,
  catalogue,
  published,
  drafts,
}: {
  lowStock: AttentionLine[];
  outOfStock: number;
  catalogue: number;
  published: number;
  drafts: number;
}) {
  return (
    <Card variant="outlined">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-on-surface text-base font-medium">Needs attention</h3>
            <p className="text-on-surface-variant mt-0.5 text-sm">
              Published lines at or below their low-stock mark ({LOW_STOCK_THRESHOLD} unless
              set on the line) — one per configuration
            </p>
          </div>
          {/* Inventory rather than the products list: this card is a worklist,
              and the page that can actually restock a line is the one it should
              hand over to. */}
          <Link
            href="/admin/inventory?state=OUT"
            className="text-primary inline-flex shrink-0 items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Inventory
            <Icon name="chevron_right" size={16} />
          </Link>
        </div>

        {lowStock.length === 0 ? (
          <p className="text-on-surface-variant flex items-center justify-center gap-2 py-6 text-center text-sm">
            <Icon name="check_circle" size={18} />
            Every published line is stocked
          </p>
        ) : (
          <ul className="divide-outline-variant/50 divide-y">
            {lowStock.map((product) => (
              <li key={product.key}>
                <Link
                  href={`/products/${product.slug}`}
                  className="state-layer -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span
                    className={cn(
                      "flex shrink-0",
                      product.stock === 0 ? "text-chart-critical" : "text-on-surface-variant",
                    )}
                  >
                    <Icon
                      name={product.stock === 0 ? "error" : "inventory_2"}
                      size={18}
                      filled={product.stock === 0}
                    />
                  </span>
                  <span className="text-on-surface min-w-0 flex-1 truncate text-sm">
                    {product.name}
                    {product.configuration && (
                      <span className="text-on-surface-variant"> · {product.configuration}</span>
                    )}
                  </span>
                  {/* The word, not just the colour — "0" and a red glyph mean
                   * nothing to a reader who gets neither. */}
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium tabular-nums",
                      product.stock === 0 ? "text-chart-critical" : "text-on-surface-variant",
                    )}
                  >
                    {product.stock === 0 ? "Out of stock" : `${product.stock} left`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-on-surface-variant border-outline-variant border-t pt-3 text-xs">
          <span className="tabular-nums">{catalogue}</span> products ·{" "}
          <span className="tabular-nums">{published}</span> published ·{" "}
          <span className="tabular-nums">{drafts}</span> draft
          {drafts === 1 ? "" : "s"} ·{" "}
          <span className="tabular-nums">{outOfStock}</span> line{outOfStock === 1 ? "" : "s"}{" "}
          out of stock
        </p>
      </CardContent>
    </Card>
  );
}
