import "server-only";

import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/send";
import {
  emailButton,
  emailHeading,
  emailIconCircle,
  emailReference,
  emailShell,
  emailThumbnail,
  emailTrustFooter,
} from "@/lib/email/layout";
import type { EmailAsset } from "@/lib/email/assets";
import { renderOrderEmail, escapeHtml, type OrderEmailKind } from "@/lib/orders/email-template";
import { getStoreSettings } from "@/lib/settings/service";
import { getPublishedSocialLinks } from "@/lib/social/service";
import { socialLinkName } from "@/lib/social/catalogue";
import { orderReference } from "@/lib/orders/reference";
import { formatPrice } from "@/lib/products/format";
import { FulfilmentMethod, Role } from "@/generated/prisma/enums";

/** The footer every customer-facing mail ends its card with. */
async function buildTrustFooter(): Promise<string> {
  const links = await getPublishedSocialLinks();
  return emailTrustFooter(
    links.map((link) => ({ url: link.url, label: socialLinkName(link.platform, link.label) })),
  );
}

type InlineImage = { cid: string; path: string };

/**
 * A product image, made reachable from a mailbox.
 *
 * `Product.image` is one of two things (`lib/products/validation`'s
 * `isSafeImageUrl` is what guarantees there is no third): a remote
 * `http(s)://` URL, which any client can already fetch and is passed through
 * untouched, or a root-relative upload under `/uploads`.
 *
 * The second kind used to be handed to `appUrl` and sent as a link, and that
 * quietly did not work: a shop that has not set `APP_URL` — or has set it to
 * something only reachable from its own network — produces
 * `http://localhost:3000/uploads/…`, which Gmail's image proxy cannot fetch,
 * so the customer gets a broken frame where their purchase should be. Attached
 * inline instead, the photograph travels inside the message and needs no
 * configuration and no publicly routable host.
 *
 * The prefix and `..` are re-checked here rather than trusted from the column,
 * because this is the boundary where a string becomes a filesystem read.
 */
function resolveLineImage(
  image: string | null,
  seen: Map<string, InlineImage>,
): string | null {
  if (!image) return null;
  if (!image.startsWith("/")) return image;
  if (!image.startsWith("/uploads/") || image.includes("..")) return null;

  // Keyed by path, so an order with the same product on two lines attaches the
  // photograph once and points both rows at it.
  const existing = seen.get(image);
  if (existing) return `cid:${existing.cid}`;

  const cid = `product-${seen.size}`;
  seen.set(image, { cid, path: join(process.cwd(), "public", image) });
  return `cid:${cid}`;
}

/**
 * Sending order mail.
 *
 * What it says lives in `./email-template`, which is pure; this is the part
 * that reads the order and hands it to the transport.
 *
 * Every caller should invoke this inside `after()`. Two reasons, and the second
 * is the important one: the customer is not left watching a spinner while a
 * mail provider takes its time, and a provider having a bad day can never fail
 * a checkout that has already claimed stock and taken a discount redemption.
 * An order that exists but whose confirmation did not send is a bad afternoon;
 * an order that failed to place because of a mail server is a broken shop.
 */
export async function sendOrderEmail(
  orderId: string,
  kind: OrderEmailKind,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shippingCents: true,
      discountCents: true,
      discountLabel: true,
      totalCents: true,
      shippingName: true,
      shippingLine1: true,
      shippingLine2: true,
      shippingCity: true,
      shippingRegion: true,
      shippingPostcode: true,
      shippingCountry: true,
      fulfilment: true,
      user: { select: { email: true } },
      items: {
        select: {
          name: true,
          variant: true,
          color: true,
          quantity: true,
          priceCents: true,
          // Read live off the product rather than snapshotted on the item —
          // see `OrderEmailLine.image`. Absent once the product is deleted.
          product: { select: { image: true } },
        },
      },
    },
  });

  // Deleted between the action and this running. Nothing to say and nobody to
  // say it to.
  if (!order?.user?.email) return;

  /**
   * Where to collect from, read at send time rather than snapshotted.
   *
   * Unlike the money and the delivery address, this is not a fact about the
   * order — it is the shop's own address, and if it has moved since the order
   * was placed then the new one is the one the customer needs to walk to.
   * Read only for a collection; a delivery has no use for it.
   */
  const [settings, trustFooterHtml] = await Promise.all([
    order.fulfilment === FulfilmentMethod.PICKUP ? getStoreSettings() : Promise.resolve(null),
    buildTrustFooter(),
  ]);

  const inlineImages = new Map<string, InlineImage>();

  const { subject, text, html, assets } = renderOrderEmail({
    ...order,
    kind,
    lines: order.items.map(({ product, ...line }) => ({
      ...line,
      image: resolveLineImage(product?.image ?? null, inlineImages),
    })),
    pickupAddress: settings?.pickupAddress ?? null,
    pickupHours: settings?.pickupHours ?? null,
    // Absolute, and built from configuration rather than the request's Host
    // header — see `lib/app-url` for why that distinction matters in mail.
    receiptUrl: appUrl(`/orders/${order.id}`),
    trustFooterHtml,
  });

  await sendEmail({
    to: order.user.email,
    subject,
    text,
    html,
    assets,
    inlineImages: [...inlineImages.values()],
  });
}

/**
 * Send without letting a failure escape.
 *
 * The callers are `after()` callbacks, where a rejection is an unhandled one:
 * it would surface as a server error long after the response, attached to
 * nothing a reader can trace back. Logged here instead, next to the order id
 * that produced it.
 */
export async function sendOrderEmailSafely(
  orderId: string,
  kind: OrderEmailKind,
): Promise<void> {
  try {
    await sendOrderEmail(orderId, kind);
  } catch (error) {
    console.error(`[order-email] could not send ${kind} for ${orderId}`, error);
  }
}

/**
 * Tell every administrator a new order came in.
 *
 * Mirrors `notifyAdmins` in `lib/notifications/service` — every account with
 * the ADMIN role, unconditionally. There is no per-admin preference to honour
 * here the way there is for a customer's own order mail: an admin did not
 * place this order and cannot opt out of being told the shop made a sale.
 */
export async function sendAdminOrderPlacedEmail(orderId: string): Promise<void> {
  const [order, admins] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        totalCents: true,
        user: { select: { name: true, email: true } },
        items: {
          select: {
            name: true,
            variant: true,
            color: true,
            quantity: true,
            priceCents: true,
            product: { select: { image: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { email: true },
    }),
  ]);

  if (!order || admins.length === 0) return;

  const reference = orderReference(order.id);
  const subject = `New order received · ${reference}`;
  const who = order.user?.name || order.user?.email || "A customer";
  const total = formatPrice(order.totalCents);
  const link = appUrl(`/admin/orders/${order.id}`);

  const text = [
    `${who} placed an order for ${total}.`,
    "",
    `Order ${reference}`,
    "",
    ...order.items.map((item) => {
      const detail = [item.variant, item.color].filter(Boolean).join(" · ");
      return `${item.quantity} × ${item.name}${detail ? ` (${detail})` : ""} — ${formatPrice(
        item.priceCents * item.quantity,
      )}`;
    }),
    "",
    "View it in the admin dashboard:",
    link,
  ].join("\n");

  /**
   * What was actually bought, with the pictures.
   *
   * The point of this mail is that somebody has to go and pick these off a
   * shelf, and a total tells them nothing about what to pick. Same shape the
   * customer's own receipt uses, so the two are recognisably one order.
   */
  const inlineImages = new Map<string, InlineImage>();
  const itemRows = order.items
    .map((item) => {
      const detail = [item.variant, item.color].filter(Boolean).join(" · ");
      const cell = "padding:14px 0;border-bottom:1px solid #e1e2ec;vertical-align:top";
      return `<tr>
      <td class="ecom-thumbCell" style="${cell};width:72px">${emailThumbnail(
        resolveLineImage(item.product?.image ?? null, inlineImages),
        72,
      )}</td>
      <td style="${cell};padding-left:14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
          <tr>
            <td style="font-weight:700;font-size:15px;color:#1b1b1f;line-height:1.35">${escapeHtml(
              item.name,
            )}</td>
            <td style="padding-left:10px;text-align:right;white-space:nowrap;font-weight:700;font-size:15px;color:#1b1b1f;vertical-align:top">${escapeHtml(
              formatPrice(item.priceCents * item.quantity),
            )}</td>
          </tr>
        </table>
        ${detail ? `<div style="color:#44474f;font-size:13px;margin-top:4px">${escapeHtml(detail)}</div>` : ""}
        <div style="color:#44474f;font-size:13px;margin-top:3px">Qty ${item.quantity} &nbsp;&times;&nbsp; ${escapeHtml(
          formatPrice(item.priceCents),
        )}</div>
      </td>
    </tr>`;
    })
    .join("");

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ecom-stack" style="border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td class="ecom-iconCell" style="width:72px;vertical-align:top">${emailIconCircle("box", 56)}</td>
      <td style="vertical-align:top">
        ${emailHeading("New order received")}
        <p style="margin:0 0 10px;color:#44474f;font-size:15px;line-height:1.5">${escapeHtml(
          who,
        )} placed an order for <strong style="color:#1b1b1f">${escapeHtml(total)}</strong>.</p>
        ${emailReference("Order", escapeHtml(reference))}
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #e1e2ec;margin-bottom:24px">
    ${itemRows}
  </table>

  <p style="margin:0">${emailButton(link, "View in dashboard", "receiptOn")}</p>`.trim();

  // No trust footer: this goes to the shop, not a customer. "Thank you for
  // shopping with us" addressed to the person who runs the shop reads as a
  // template that was never looked at.
  const html = emailShell(body, appUrl("/"));
  const assets: EmailAsset[] = ["headerArt", "box", "receiptOn"];

  await Promise.all(
    admins
      .filter((admin) => admin.email)
      .map((admin) =>
        sendEmail({
          to: admin.email!,
          subject,
          text,
          html,
          assets,
          inlineImages: [...inlineImages.values()],
        }),
      ),
  );
}

export async function sendAdminOrderPlacedEmailSafely(orderId: string): Promise<void> {
  try {
    await sendAdminOrderPlacedEmail(orderId);
  } catch (error) {
    console.error(`[order-email] could not notify admins for ${orderId}`, error);
  }
}
