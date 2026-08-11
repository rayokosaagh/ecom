import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import type { OrderLine } from "@/lib/orders/row-view";

/**
 * What was actually bought, revealed under a row.
 *
 * Deliberately the same object as the receipt's line list in `OrderDetail` —
 * same 14px thumbnail treatment, same fallback glyph, same rule about linking
 * only where the product still exists — so opening an order after expanding it
 * is a continuation rather than a second, differently-shaped answer.
 *
 * Smaller, though. This is a preview inside a list of fifty; the receipt is the
 * document. The image is 40px here against 56 there, and the quantity sits on
 * one line with the variant rather than getting its own.
 */
export function OrderLines({
  lines,
  hidden,
  href,
}: {
  lines: OrderLine[];
  /** Lines past the preview bound — see `MAX_PREVIEW_LINES`. */
  hidden: number;
  /** The order itself, where the rest of a long one can be read. */
  href: string;
}) {
  return (
    <div className="bg-surface-container-low rounded-lg px-3 py-2">
      <ul className="divide-outline-variant/50 divide-y">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3 py-2">
            <span className="bg-surface-container-highest size-10 shrink-0 overflow-hidden rounded-md">
              {line.image ? (
                // Plain <img> for the same reason the catalogue uses one: these
                // URLs are operator-supplied and can point at any host, so they
                // are deliberately not routed through next/image.
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={line.image} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="text-on-surface-variant grid size-full place-items-center">
                  <Icon name="image" size={18} />
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              {line.href ? (
                <Link
                  href={line.href}
                  className="text-on-surface block truncate rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {line.name}
                </Link>
              ) : (
                <p className="text-on-surface truncate text-sm">{line.name}</p>
              )}

              <p className="text-on-surface-variant mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <span className="tabular-nums">Qty {line.quantity}</span>
                {line.variant && <span>· {line.variant}</span>}
                {line.color && (
                  <span className="flex items-center gap-1">
                    ·
                    {line.colorHex && (
                      <span
                        aria-hidden
                        className="ring-outline-variant size-2.5 rounded-full ring-1"
                        style={{ backgroundColor: line.colorHex }}
                      />
                    )}
                    {line.color}
                  </span>
                )}
                {line.each && <span>· {line.each} each</span>}
              </p>
            </div>

            <span className="text-on-surface shrink-0 text-sm tabular-nums">{line.total}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <Link
          href={href}
          className="text-primary inline-flex items-center gap-1 rounded-sm py-2 text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {hidden} more line{hidden === 1 ? "" : "s"} — open the order
          <Icon name="chevron_right" size={14} />
        </Link>
      )}
    </div>
  );
}
