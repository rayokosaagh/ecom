import { formatPrice } from "@/lib/products/format";
import { orderReference } from "@/lib/orders/reference";
import { FulfilmentMethod, type OrderStatus } from "@/generated/prisma/enums";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";
import {
  emailAddressBlock,
  emailButton,
  emailDeliveryCard,
  emailHeading,
  emailIconCircle,
  emailMoneyCard,
  emailReference,
  emailShell,
  emailStatusCard,
  emailThumbnail,
  emailTracker,
  type MoneyRow,
  type TrackerStep,
} from "@/lib/email/layout";
import type { EmailAsset } from "@/lib/email/assets";

/** Mirrors `TABLE_OPEN` in `lib/email/layout` — see that file on why tables. */
const TABLE_OPEN =
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse';

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
  /**
   * The product's current image, not a snapshot — `OrderItem` keeps no image
   * of its own, so this is read live off `Product` at send time and is
   * absent once the product (or a productless line) is gone. Already an
   * absolute URL; product images are operator-supplied and can point at any
   * host, so nothing here rewrites it.
   */
  image?: string | null;
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
  /**
   * The card-internal footer, pre-rendered — `emailTrustFooter(...)`'s output.
   * Built by the caller because it comes from `SocialLink`, a database table,
   * and this module stays free of `server-only`; passed through unchanged for
   * the same reason `pickupAddress` is.
   */
  trustFooterHtml?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /**
   * The art this body refers to by `cid:`, for the transport to attach.
   *
   * Collected by the renderer rather than assumed by the sender: which marks a
   * mail draws depends on its kind and on whether it has an address to show,
   * and an asset attached but unreferenced is dead weight in an inbox while
   * one referenced but unattached is a broken image.
   */
  assets: EmailAsset[];
}

/**
 * The headline for each kind.
 *
 * `PAID`, `SHIPPED`, `DELIVERED` and `CANCELLED` mirror `CUSTOMER_NOTICE` in
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
  DELIVERED: {
    subject: "Order delivered",
    lead: "Your order has arrived. Tell us what you thought of it.",
  },
  CANCELLED: {
    subject: "Order cancelled",
    lead: "Your order was cancelled. Anything paid will be refunded.",
  },
};

/**
 * The roundel next to the headline: what this mail is about, in one mark.
 *
 * Each kind gets its own rather than sharing a generic tick, because this is
 * the first thing read and it should already say which of the six messages
 * this is before the headline beside it is.
 */
const HERO_ICON: Record<OrderEmailKind, EmailAsset> = {
  PLACED: "check",
  PENDING: "clock",
  PAID: "card",
  SHIPPED: "truck",
  DELIVERED: "home",
  CANCELLED: "cancel",
};

/**
 * The note above the tracker, for the kinds that have one.
 *
 * Deliberately not the headline repeated: the hero has already said "Order
 * shipped" three lines above, and saying it again word for word next to a
 * progress bar reads as a template that got rendered twice. This says where
 * the parcel is now, which is the question the tracker underneath answers.
 */
const STATUS_NOTE: Partial<Record<OrderEmailKind, { title: string; text: string }>> = {
  SHIPPED: {
    title: "On the way",
    text: "Your order has left us and is heading to your address.",
  },
  DELIVERED: {
    title: "Arrived",
    text: "Your order was delivered. We hope it was worth the wait.",
  },
};

/**
 * The 3-step shipment tracker, only for a kind that has actually shipped.
 *
 * `null` for everything before `SHIPPED` and for a collection — a tracker
 * that shows three empty circles for an order still being packed says
 * nothing a customer needs, and a pickup was never going to move through
 * "in transit" at all.
 *
 * Only two of the three steps are events the shop actually records. "In
 * transit" is not a status anything writes; it is inferred from the parcel
 * having shipped and not yet arrived, which is a safe inference rather than an
 * invented timestamp — which is also why no step ever carries a date.
 */
function shipmentTracker(kind: OrderEmailKind): [TrackerStep, TrackerStep, TrackerStep] | null {
  const box = { on: "boxOn", off: "boxOff" } as const;
  const van = { on: "truckOn", off: "truckOff" } as const;
  const door = { on: "homeOn", off: "homeOff" } as const;

  if (kind === "SHIPPED") {
    // Shipped and in transit are the same fact, so the tracker says so: the
    // parcel leaving is what puts it on the road. Marking "Shipped" done and
    // stopping there implied a parcel that had been handed over and then sat
    // still, which is not what a customer reading "on its way" is being told.
    return [
      { label: "Shipped", icon: box, state: "done" },
      { label: "In transit", icon: van, state: "current" },
      { label: "Delivered", icon: door, state: "future" },
    ];
  }
  if (kind === "DELIVERED") {
    return [
      { label: "Shipped", icon: box, state: "done" },
      { label: "In transit", icon: van, state: "done" },
      { label: "Delivered", icon: door, state: "done" },
    ];
  }
  return null;
}

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
          // Town, region and postcode on one line, the way an address is
          // actually written — "Dharan, Koshi 56700" rather than three stacked
          // fragments that read as a form dump instead of somewhere to post to.
          [
            [order.shippingCity, order.shippingRegion].filter(Boolean).join(", "),
            order.shippingPostcode,
          ]
            .filter(Boolean)
            .join(" "),
          order.shippingCountry,
        ]
  ).filter((part): part is string => Boolean(part && part.trim()));

  /**
   * The money, in the order a receipt reads.
   *
   * Delivery is always shown, free or not — "Delivery: Free" is information a
   * customer wants, and a missing row reads as an omission rather than a
   * saving. The discount row appears only when one applied.
   *
   * A saving is marked `positive` and renders green: both a discount and a
   * waived delivery charge are money the customer did not pay, and that is
   * worth pointing at rather than leaving to be inferred from the arithmetic.
   */
  const moneyRows: MoneyRow[] = [
    { label: "Subtotal", value: formatPrice(subtotal) },
    ...(order.discountCents > 0
      ? [
          {
            label: order.discountLabel ?? "Discount",
            value: `−${formatPrice(order.discountCents)}`,
            tone: "positive" as const,
          },
        ]
      : []),
    {
      label: labels.charge,
      value: order.shippingCents > 0 ? formatPrice(order.shippingCents) : "Free",
      ...(order.shippingCents > 0 ? {} : { tone: "positive" as const }),
    },
  ];
  const totalRow: MoneyRow = { label: "Total", value: formatPrice(order.totalCents) };

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
    ...[...moneyRows, totalRow].map((row) => `${row.label}: ${row.value}`),
    "",
    ...(address.length > 0 ? [`${labels.destination}:`, ...address, ""] : []),
    "See the full receipt:",
    order.receiptUrl,
  ].join("\n");

  // Home link for the footer, taken from the receipt's own origin rather than
  // `appUrl` — this module stays free of `server-only` on purpose, see the
  // file banner, and the receipt link is already absolute for the same reason.
  const homeUrl = new URL(order.receiptUrl).origin;

  const tracker = shipmentTracker(order.kind);
  const note = STATUS_NOTE[order.kind];

  const deliveryBlock =
    address.length > 0
      ? emailDeliveryCard(
          emailAddressBlock(
            escapeHtml(labels.destination),
            address.map((part) => escapeHtml(part)),
          ),
          tracker && note
            ? `${emailStatusCard(
                HERO_ICON[order.kind],
                escapeHtml(note.title),
                escapeHtml(note.text),
              )}${emailTracker(tracker)}`
            : undefined,
        )
      : "";

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ecom-stack" style="border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td class="ecom-iconCell" style="width:72px;vertical-align:top">${emailIconCircle(
        HERO_ICON[order.kind],
        56,
        order.kind === "CANCELLED" ? "error" : "primary",
      )}</td>
      <td style="vertical-align:top">
        ${emailHeading(escapeHtml(headline.subject))}
        <p style="margin:0 0 10px;color:#44474f;font-size:15px;line-height:1.5">${escapeHtml(
          headline.lead,
        )}</p>
        ${emailReference("Order", escapeHtml(reference))}
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #e1e2ec;margin-bottom:24px">
    ${order.lines
      .map((line) => {
        const detail = describeLine(line);
        const cell = "padding:18px 0;border-bottom:1px solid #e1e2ec;vertical-align:top";
        /**
         * Two columns, never three.
         *
         * The line total used to be a column of its own, which meant the name
         * competed with it for a phone's width and lost — a long product name
         * broke over three lines against a price that could not wrap. Nested
         * inside the text column it sits on the same line as the name and
         * right-aligns against it, so the pair reads as one line of a receipt
         * at any width and the details sit under both.
         */
        return `<tr>
      <td class="ecom-thumbCell" style="${cell};width:88px">${emailThumbnail(line.image ?? null)}</td>
      <td style="${cell};padding-left:16px">
        ${TABLE_OPEN}">
          <tr>
            <td style="font-weight:700;font-size:16px;color:#1b1b1f;line-height:1.35">${escapeHtml(
              line.name,
            )}</td>
            <td style="padding-left:10px;text-align:right;white-space:nowrap;font-weight:700;font-size:16px;color:#1b1b1f;vertical-align:top">${escapeHtml(
              formatPrice(line.priceCents * line.quantity),
            )}</td>
          </tr>
        </table>
        ${detail ? `<div style="color:#44474f;font-size:14px;margin-top:6px">${escapeHtml(detail)}</div>` : ""}
        <div style="color:#44474f;font-size:14px;margin-top:4px">Qty ${line.quantity} &nbsp;&times;&nbsp; ${escapeHtml(
          formatPrice(line.priceCents),
        )}</div>
      </td>
    </tr>`;
      })
      .join("")}
  </table>

  ${emailMoneyCard(
    moneyRows.map((row) => ({ ...row, label: escapeHtml(row.label), value: escapeHtml(row.value) })),
    { label: escapeHtml(totalRow.label), value: escapeHtml(totalRow.value) },
  )}

  <p style="margin:24px 0 ${deliveryBlock ? "24px" : "0"}">
    ${emailButton(order.receiptUrl, "View your receipt", "receiptOn")}
  </p>

  ${deliveryBlock}`.trim();

  const html = emailShell(body, homeUrl, order.trustFooterHtml);

  /**
   * Exactly what the body above draws — no more.
   *
   * "No more" is the part that matters, and it is not tidiness. Gmail hides an
   * inline attachment the HTML actually references and lists everything else
   * as a download, so attaching both inks of every tracker step put three
   * stray icons under the message as "3 attachments". Each entry here is
   * therefore conditional on the thing that renders it: the step's own state
   * picks one ink, `heart` rides on the caller having passed a trust footer to
   * put it in, and `pin` on there being an address at all.
   */
  const assets: EmailAsset[] = [
    "headerArt",
    "receiptOn",
    HERO_ICON[order.kind],
    ...(order.trustFooterHtml ? (["heart"] as EmailAsset[]) : []),
    ...(address.length > 0 ? (["pin"] as EmailAsset[]) : []),
    ...(tracker
      ? ([
          "deliveryArt",
          ...tracker.map((step) => (step.state === "future" ? step.icon.off : step.icon.on)),
        ] as EmailAsset[])
      : []),
  ];

  return { subject, text, html, assets };
}
