import { formatPrice } from "@/lib/products/format";
import { orderReference } from "@/lib/orders/reference";
import { FulfilmentMethod, type OrderStatus } from "@/generated/prisma/enums";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";

/**
 * What an order email says.
 *
 * Deliberately free of `server-only`, Prisma and the mail transport: this
 * decides what a customer is told about money they have spent, and it is worth
 * being able to exercise directly. `npm run check:order-email` does that.
 *
 * The one job that is easy to get wrong here is escaping. Product names, the
 * shipping address and the discount label are all operator- or customer-typed
 * and land in an HTML body, so every interpolation goes through `escapeHtml`.
 * A mail client is a browser.
 */

/** Which message this is. `PLACED` has no status of its own — it is PENDING. */
export type OrderEmailKind = "PLACED" | Extract<OrderStatus, string>;

export interface OrderEmailLine {
  name: string;
  /** Configuration, e.g. "16 GB / 512 GB". */
  variant: string | null;
  color: string | null;
  quantity: number;
  /** Price each, as charged. */
  priceCents: number;
}

export interface OrderEmailInput {
  id: string;
  kind: OrderEmailKind;
  lines: OrderEmailLine[];
  shippingCents: number;
  discountCents: number;
  discountLabel: string | null;
  totalCents: number;
  /**
   * All nullable, because they are nullable on the order.
   *
   * Orders placed before the shipping address existed carry none of these, and
   * a receipt for one still has to render — so the address is assembled from
   * whatever is present and the block is dropped entirely when nothing is.
   */
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingRegion: string | null;
  shippingPostcode: string | null;
  shippingCountry: string | null;
  /**
   * Delivered or collected. Decides what the charge row is called and whether
   * the block below the totals is an address to send to or one to come to.
   */
  fulfilment: FulfilmentMethod;
  /** Where to collect from, as the shop typed it. Only read for a pickup. */
  pickupAddress: string | null;
  pickupHours: string | null;
  /** Absolute link to the receipt. Built by the caller — see `lib/app-url`. */
  receiptUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * The headline for each kind.
 *
 * `PAID`, `SHIPPED` and `CANCELLED` mirror `CUSTOMER_NOTICE` in
 * `lib/actions/orders` — the same event, said the same way, so a customer who
 * sees both the in-app notice and the email is not told two different things.
 */
const HEADLINES: Record<OrderEmailKind, { subject: string; lead: string }> = {
  PLACED: {
    subject: "Order confirmed",
    lead: "Thanks for your order. We have it and will let you know when it ships.",
  },
  PENDING: {
    subject: "Order received",
    lead: "We have your order and are getting it ready.",
  },
  PAID: {
    subject: "Payment confirmed",
    lead: "We have your payment and are preparing your order.",
  },
  SHIPPED: {
    subject: "Order shipped",
    lead: "Your order is on its way.",
  },
  CANCELLED: {
    subject: "Order cancelled",
    lead: "Your order was cancelled. Anything paid will be refunded.",
  },
};

/**
 * Escape before interpolating into the HTML body.
 *
 * Product names and addresses are typed by people. `&` first, or it would
 * double-escape the entities the later replacements introduce.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "16 GB / 512 GB · Space Grey", or "" when a line has neither. */
function describeLine(line: OrderEmailLine): string {
  return [line.variant, line.color].filter(Boolean).join(" · ");
}

/** Goods before delivery and before any code — what the lines add up to. */
export function subtotalOf(lines: OrderEmailLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}

export function renderOrderEmail(order: OrderEmailInput): RenderedEmail {
  const headline = HEADLINES[order.kind];
  const reference = orderReference(order.id);
  const subject = `${headline.subject} · ${reference}`;

  const subtotal = subtotalOf(order.lines);

  const labels = fulfilmentLabels(order.fulfilment);
  const collecting = order.fulfilment === FulfilmentMethod.PICKUP;

  /**
   * The block under the totals: where it is going, or where to come.
   *
   * One list either way, so both the text and the HTML render it identically
   * and neither has to branch. For a collection the shop's address is what the
   * customer needs — their own name is on the order, but it is the counter they
   * have to find — with the collector's name above it so the right person knows
   * to go.
   */
  const address = (
    collecting
      ? [
          order.shippingName,
          // The shop's address as typed, one entry per line, so it reads the
          // way it was written rather than as one run-on line.
          ...(order.pickupAddress ?? "").split(/\r?\n/),
          order.pickupHours,
        ]
      : [
          order.shippingName,
          order.shippingLine1,
          order.shippingLine2,
          [order.shippingCity, order.shippingRegion].filter(Boolean).join(", "),
          order.shippingPostcode,
          order.shippingCountry,
        ]
  ).filter((part): part is string => Boolean(part && part.trim()));

  /**
   * The money, in the order a receipt reads.
   *
   * Delivery is always shown, free or not — "Delivery: Free" is information a
   * customer wants, and a missing row reads as an omission rather than a
   * saving. The discount row appears only when one applied.
   */
  const totals: [string, string][] = [
    ["Subtotal", formatPrice(subtotal)],
    ...(order.discountCents > 0
      ? ([
          [order.discountLabel ?? "Discount", `−${formatPrice(order.discountCents)}`],
        ] as [string, string][])
      : []),
    [labels.charge, order.shippingCents > 0 ? formatPrice(order.shippingCents) : "Free"],
    ["Total", formatPrice(order.totalCents)],
  ];

  const text = [
    headline.lead,
    "",
    `Order ${reference}`,
    "",
    ...order.lines.map((line) => {
      const detail = describeLine(line);
      return `${line.quantity} × ${line.name}${detail ? ` (${detail})` : ""} — ${formatPrice(
        line.priceCents * line.quantity,
      )}`;
    }),
    "",
    ...totals.map(([label, value]) => `${label}: ${value}`),
    "",
    ...(address.length > 0 ? [`${labels.destination}:`, ...address, ""] : []),
    "See the full receipt:",
    order.receiptUrl,
  ].join("\n");

  // Inline styles and a table-free layout, for the same reason the reset email
  // uses them: mail clients strip <style> blocks and disagree about the rest.
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1c1b1f;max-width:560px">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 8px">${escapeHtml(headline.subject)}</h1>
  <p style="margin:0 0 4px">${escapeHtml(headline.lead)}</p>
  <p style="margin:0 0 24px;color:#49454f">Order ${escapeHtml(reference)}</p>

  <div style="border-top:1px solid #e1e2ec">
    ${order.lines
      .map((line) => {
        const detail = describeLine(line);
        return `<div style="display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #e1e2ec">
      <div>
        <div style="font-weight:500">${escapeHtml(line.name)}</div>
        ${detail ? `<div style="color:#49454f;font-size:13px">${escapeHtml(detail)}</div>` : ""}
        <div style="color:#49454f;font-size:13px">Qty ${line.quantity} × ${escapeHtml(
          formatPrice(line.priceCents),
        )}</div>
      </div>
      <div style="white-space:nowrap;font-weight:500">${escapeHtml(
        formatPrice(line.priceCents * line.quantity),
      )}</div>
    </div>`;
      })
      .join("")}
  </div>

  <div style="margin:16px 0 24px">
    ${totals
      .map(([label, value], index) => {
        const last = index === totals.length - 1;
        return `<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;${
          last ? "font-weight:600;font-size:17px;padding-top:12px" : "color:#49454f"
        }">
      <span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span>
    </div>`;
      })
      .join("")}
  </div>

  <p style="margin:0 0 24px">
    <a href="${escapeHtml(order.receiptUrl)}" style="display:inline-block;background:#6750a4;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500">View your receipt</a>
  </p>

  ${
    address.length > 0
      ? `<p style="margin:0;color:#49454f;font-size:13px">
    <strong style="color:#1c1b1f">${escapeHtml(labels.destination)}</strong><br>
    ${address.map((part) => escapeHtml(part)).join("<br>")}
  </p>`
      : ""
  }
</div>`.trim();

  return { subject, text, html };
}
