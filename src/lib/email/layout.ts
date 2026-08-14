/**
 * The shared shell every outgoing email renders inside.
 *
 * Mirrors the site's actual Material 3 look, not a generic email template:
 * the wordmark badge in `components/layout/Footer`, the outlined-card shape
 * (`rounded-2xl`, a thin `outline-variant` border, `components/ui/Card`), and
 * the pill buttons in `components/ui/Button`. Values are copied from
 * `globals.css` rather than imported — this has to survive as plain inline
 * styles a mail client understands, so the design tokens are mirrored here by
 * hand and will drift if the theme's palette changes without this following.
 *
 * Deliberately free of `server-only` and `app-url` — the same reason
 * `lib/orders/email-template` stays pure: both `check:order-email` and a
 * future reset-email check can exercise this directly under `tsx`, with no
 * server context to fake. Callers that have one (`appUrl`, an order's own
 * `receiptUrl`) pass the home link in rather than this module reaching for it.
 *
 * Inline styles throughout, for the reason every email template uses them:
 * mail clients strip `<style>` blocks. Anything that needs two ends of a line
 * pinned apart — a price against a label, a thumbnail against a total, the
 * logo against the wordmark — is a `<table>` rather than
 * `display:flex;justify-content:space-between`. That flex rule is not a
 * graceful-degrade case: several mail clients (the Gmail apps among them) drop
 * `justify-content` but keep the children inline, so "Subtotal" and its price
 * collapse together with no gap at all rather than stacking. A table cell is
 * the one layout primitive every mail client agrees on, so there is no bare
 * `display:flex` anywhere in this file.
 */

import { assetSrc, type EmailAsset } from "@/lib/email/assets";

const BRAND_NAME = "Ecom";

// Mirrored from `globals.css` `@theme` — see the file banner above.
const PRIMARY = "#0b57d0";
const ON_PRIMARY = "#ffffff";
const ON_SURFACE = "#1b1b1f";
const ON_SURFACE_VARIANT = "#44474f";
const OUTLINE_VARIANT = "#c4c6d0";
const DIVIDER = "#e1e2ec";
const WHITE = "#ffffff";
const SURFACE_CONTAINER_LOW = "#f5f4f9";
const PRIMARY_CONTAINER = "#d3e3fd";
const ON_PRIMARY_CONTAINER = "#041e49";
const SECONDARY_CONTAINER = "#c2e7ff";
const ON_SECONDARY_CONTAINER = "#001d35";
const ERROR_CONTAINER = "#f9dedc";
const TERTIARY = "#146c2e";

/**
 * The shop's own faces, with a real fallback behind each.
 *
 * `layout.tsx` loads DM Sans and DM Serif Display through `next/font`, which
 * is a mechanism a mail client has no part in — a webfont reaches a mail
 * roughly never, since Gmail strips the `<style>` block an `@font-face` would
 * have to live in. Naming them first still costs nothing and pays off in the
 * clients that do resolve an installed family, and the fallbacks are picked to
 * hold the same shape rather than to be generic: DM Sans is a geometric sans,
 * so Segoe UI before system-ui, and the display face is a high-contrast serif,
 * so Georgia before the generic.
 */
const FONT_SANS = "'DM Sans','Segoe UI',system-ui,-apple-system,sans-serif";
const FONT_DISPLAY = "'DM Serif Display',Georgia,'Times New Roman',serif";

/**
 * The one stylesheet in an otherwise entirely inline-styled document.
 *
 * Everything else here is inline precisely because `<style>` is unreliable —
 * so this carries nothing the mail needs, only adjustments for a narrow
 * screen. A client that drops the block renders the desktop layout, which
 * already fits 380px; a client that honours it (Gmail's apps, Apple Mail,
 * Outlook mobile) gets tighter gutters, a smaller thumbnail and no masthead
 * flourish, which is the decorative half and the first thing worth losing.
 *
 * `!important` throughout, because an inline style beats a stylesheet rule on
 * specificity and every one of these is overriding exactly that.
 */
const MOBILE_STYLES = `
<style>
@media only screen and (max-width:620px){
  .ecom-shell{padding:12px 6px !important}
  .ecom-body{padding:18px 16px !important;font-size:16px !important}
  .ecom-bar{padding:14px 16px !important}
  .ecom-h1{font-size:22px !important;line-height:1.25 !important}
  .ecom-thumb{width:64px !important;height:64px !important}
  .ecom-thumbCell{width:64px !important}
  .ecom-art{display:none !important}
  .ecom-inner{padding:16px !important}
  /* An icon beside a paragraph indents that paragraph by the icon's column,
     and with four such rows the body ends up on four different left edges.
     Dropping the icon onto its own line puts every block back on one. */
  .ecom-stack,.ecom-stack tbody,.ecom-stack tr,.ecom-stack td{display:block !important;width:100% !important}
  .ecom-iconCell{padding:0 0 12px 0 !important}
  .ecom-socials{text-align:left !important;padding-top:14px !important}
  /* A thumb is about 44px across; a link the width of the card cannot be missed. */
  .ecom-btn{display:block !important;text-align:center !important;padding:16px 20px !important}
}
</style>`;

/** Opens a full-width layout table. Every multi-column block here starts with one. */
const TABLE_OPEN =
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse';

/**
 * Escape before an attribute, not just a text node.
 *
 * A local copy rather than importing `escapeHtml` from `orders/email-template`
 * — that would make this lower-level module depend on the one built on top of
 * it. Every caller here hands in a URL, not prose, but a URL is still
 * attacker-reachable in the ways that matter to an attribute: a stray `"`
 * breaks out of it.
 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Pill button — `h-10 rounded-full px-6` on `Button`'s `filled` variant.
 *
 * The optional mark rides inside the label rather than in its own cell: an
 * anchor is what carries the click, and a table inside one is not reliably
 * clickable across its whole area.
 */
export function emailButton(href: string, label: string, icon?: EmailAsset): string {
  const mark = icon
    ? `<img src="${assetSrc(
        icon,
      )}" width="17" height="17" alt="" style="vertical-align:middle;border:0;margin-right:9px">`
    : "";
  return `<a class="ecom-btn" href="${escapeAttr(href)}" style="display:inline-block;background:${PRIMARY};color:${ON_PRIMARY};text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px"><span style="vertical-align:middle">${mark}${label}</span></a>`;
}

/** `text-headline-sm`-scale: bigger and bolder than a body heading has to be. */
export function emailHeading(text: string): string {
  return `<h1 class="ecom-h1" style="font-family:${FONT_SANS};font-size:27px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;margin:0 0 8px;color:${ON_SURFACE}">${text}</h1>`;
}

/** A small pill label — same treatment `ProductCard`'s badges use, tonal rather than filled. */
export function emailBadge(text: string): string {
  return `<span style="display:inline-block;background:${SECONDARY_CONTAINER};color:${ON_SECONDARY_CONTAINER};padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0.02em">${text}</span>`;
}

/**
 * A reference stated inline — "Order 15JWY2CR", the identifier in the brand
 * colour. A pill would compete with the headline directly above it; this is
 * the same weight as the lead line and reads as part of the sentence.
 */
export function emailReference(label: string, value: string): string {
  return `<p style="margin:0;font-size:15px;color:${ON_SURFACE_VARIANT}">${label} <span style="color:${PRIMARY};font-weight:700">${value}</span></p>`;
}

/** A section title inside a card — `text-title-md`, not an uppercase eyebrow. */
function emailCardTitle(text: string): string {
  return `<div style="font-size:16px;font-weight:700;color:${ON_SURFACE};margin:0 0 6px">${text}</div>`;
}

export interface MoneyRow {
  label: string;
  value: string;
  /** `positive` renders green — a saving: free delivery, a discount applied. */
  tone?: "default" | "positive";
}

/**
 * The receipt's money, in one tinted card: the running rows, a rule, and the
 * total beneath it at a size that makes it the thing you read first.
 *
 * A tinted panel rather than loose rows on the page because the total is the
 * one number a customer scans for, and grouping the arithmetic that produced
 * it into a single block is what makes it findable at a glance.
 */
export function emailMoneyCard(rows: MoneyRow[], total: MoneyRow): string {
  const cell = `font-size:15px;padding:5px 0`;
  const body = rows
    .map(
      (row) =>
        `<tr>
      <td style="${cell};color:${ON_SURFACE_VARIANT}">${row.label}</td>
      <td style="${cell};text-align:right;font-weight:${row.tone === "positive" ? 700 : 500};color:${
        row.tone === "positive" ? TERTIARY : ON_SURFACE
      }">${row.value}</td>
    </tr>`,
    )
    .join("");

  return `
${TABLE_OPEN};background:${SURFACE_CONTAINER_LOW};border-radius:16px">
  <tr>
    <td class="ecom-inner" style="padding:20px 22px">
      ${TABLE_OPEN}">
        ${body}
        <tr><td colspan="2" style="padding:10px 0 0"><div style="height:1px;background:${DIVIDER};font-size:0;line-height:0">&nbsp;</div></td></tr>
        <tr>
          <td style="padding-top:12px;font-size:20px;font-weight:700;color:${ON_SURFACE}">${total.label}</td>
          <td style="padding-top:12px;text-align:right;font-size:20px;font-weight:700;color:${ON_SURFACE}">${total.value}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

/**
 * A tinted roundel holding a status glyph.
 *
 * The mark is a `cid:` image — see `lib/email/assets` for why that is the only
 * form of picture worth putting in a mail. Whatever draws one of these has to
 * name the asset in its `RenderedEmail.assets`, or it arrives as a broken
 * image rather than as nothing.
 */
export function emailIconCircle(
  asset: EmailAsset,
  size = 56,
  tone: "primary" | "error" = "primary",
): string {
  const glyphSize = Math.round(size * 0.46);
  const bg = tone === "error" ? ERROR_CONTAINER : PRIMARY_CONTAINER;
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;background:${bg};border-radius:999px"><img src="${assetSrc(
    asset,
  )}" width="${glyphSize}" height="${glyphSize}" alt="" style="vertical-align:middle;border:0"></span>`;
}

/** The same mark in a rounded square rather than a circle — see `emailIconCircle`. */
function emailIconTile(asset: EmailAsset, size = 36): string {
  const glyphSize = Math.round(size * 0.5);
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;background:${PRIMARY_CONTAINER};border-radius:12px"><img src="${assetSrc(
    asset,
  )}" width="${glyphSize}" height="${glyphSize}" alt="" style="vertical-align:middle;border:0"></span>`;
}

/** A tonal callout card with an icon — the "On the way" / "Delivered" status box. */
export function emailStatusCard(asset: EmailAsset, title: string, text: string): string {
  return `
${TABLE_OPEN};background:${PRIMARY_CONTAINER};border-radius:14px">
  <tr>
    <td style="padding:14px;width:50px;vertical-align:top">${emailIconCircle(asset, 36)}</td>
    <td style="padding:14px 16px 14px 0;vertical-align:top">
      <div style="font-weight:700;font-size:14px;color:${ON_PRIMARY_CONTAINER}">${title}</div>
      <div style="font-size:13px;color:${ON_PRIMARY_CONTAINER};margin-top:3px;line-height:1.45">${text}</div>
    </td>
  </tr>
</table>`.trim();
}

export interface TrackerStep {
  label: string;
  /** The three inks of one glyph — see `TRACKER_PATHS` in `build-email-art`. */
  icon: { on: EmailAsset; off: EmailAsset };
  state: "done" | "current" | "future";
}

/**
 * A fixed 3-step shipment tracker, drawn as a vertical timeline.
 *
 * Exactly 3 steps because that is what a status email can honestly claim —
 * "shipped" and "delivered" are events the shop actually records; there is no
 * "in transit" timestamp behind it, so that middle step is never marked
 * `done` on its own, only reached as the current one on the way to the third.
 *
 * Vertical rather than the horizontal row this replaced, and that is the whole
 * point of it: three steps side by side have to share the width, so each label
 * gets a third of a phone screen and "In transit" sits one long word away from
 * wrapping mid-phrase. Stacked, every label has the full column whatever the
 * screen, the labels read left-to-right like the rest of the message instead of
 * being centred and right-aligned to fit, and nothing has to be measured
 * against anything. It costs vertical space, which a scrolling inbox has.
 *
 * A reached step is a filled brand-blue dot; an unreached one is left white and
 * ringed in the outline colour. The glyph stays put either way, so the list
 * reads as one journey rather than as icons that appear once earned.
 */
export function emailTracker(steps: [TrackerStep, TrackerStep, TrackerStep]): string {
  const dot = (step: TrackerStep) => {
    const reached = step.state !== "future";
    return `<span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:${
      reached ? PRIMARY : WHITE
    };border:2px solid ${
      reached ? PRIMARY : OUTLINE_VARIANT
    };border-radius:999px"><img src="${assetSrc(
      reached ? step.icon.on : step.icon.off,
    )}" width="18" height="18" alt="" style="vertical-align:middle;border:0"></span>`;
  };

  // The rail is coloured by the step *above* it: the journey is complete as far
  // as the last thing that actually happened, and no further.
  const rail = (state: TrackerStep["state"]) =>
    `<div style="width:2px;height:22px;background:${
      state === "done" ? PRIMARY : OUTLINE_VARIANT
    };margin:0 auto;font-size:0;line-height:0">&nbsp;</div>`;

  const row = (step: TrackerStep, index: number) => `
  <tr>
    <td style="width:38px;text-align:center;vertical-align:middle">${dot(step)}</td>
    <td style="padding-left:14px;vertical-align:middle;font-size:15px;${
      step.state === "future"
        ? `color:${ON_SURFACE_VARIANT};font-weight:500`
        : `color:${PRIMARY};font-weight:700`
    }">${step.label}</td>
  </tr>${
    index < steps.length - 1
      ? `
  <tr>
    <td style="text-align:center;font-size:0;line-height:0">${rail(step.state)}</td>
    <td></td>
  </tr>`
      : ""
  }`;

  return `
${TABLE_OPEN};margin-top:18px">
  ${steps.map(row).join("")}
</table>`.trim();
}

/**
 * A product thumbnail, in the same frame `ProductCard` uses: a square crop on
 * a tinted ground, rounded corners, and that same tinted square left blank in
 * place of a missing image rather than leaving a hole in the layout.
 *
 * The tint matters for more than the empty case — product shots are cut out on
 * transparency, and a transparent PNG on white loses its edges entirely.
 */
export function emailThumbnail(src: string | null, size = 88): string {
  const frame = `width:${size}px;height:${size}px;border-radius:14px;background:${SURFACE_CONTAINER_LOW}`;
  if (!src) {
    return `<div class="ecom-thumb" style="${frame}">&nbsp;</div>`;
  }
  return `<img class="ecom-thumb" src="${escapeAttr(src)}" width="${size}" height="${size}" alt="" style="${frame};object-fit:cover;display:block">`;
}

/**
 * An outlined panel — `Card variant="outlined"`: surface ground, a hairline
 * border, generous radius. What the delivery block sits in.
 */
function emailOutlinedCard(innerHtml: string): string {
  return `
${TABLE_OPEN};background:${WHITE};border:1px solid ${DIVIDER};border-radius:16px">
  <tr><td class="ecom-inner" style="padding:20px">${innerHtml}</td></tr>
</table>`.trim();
}

/**
 * Where the order is going: a title, and the address as written.
 *
 * `lines[0]` is the recipient and is set in the text colour at a heavier
 * weight than the rest — on a delivery that is the name the courier is
 * looking for, and on a collection it is the person allowed to walk out with
 * the box. The remaining lines are muted, so the block reads as a name with
 * an address under it rather than five equal lines of small print.
 */
export function emailAddressBlock(title: string, lines: string[]): string {
  return `
${TABLE_OPEN}" class="ecom-stack">
  <tr>
    <td class="ecom-iconCell" style="width:50px;vertical-align:top">${emailIconTile("pin", 36)}</td>
    <td style="vertical-align:top">
      ${emailCardTitle(title)}
      <div style="color:${ON_SURFACE_VARIANT};font-size:14px;line-height:1.8">
        <span style="color:${ON_SURFACE};font-weight:700;font-size:15px">${lines[0]}</span>${
          lines.length > 1 ? `<br>${lines.slice(1).join("<br>")}` : ""
        }
      </div>
    </td>
  </tr>
</table>`.trim();
}

/**
 * The delivery panel: where it is going, and how far along it is.
 *
 * Stacked rather than the two columns the design this follows uses, and
 * deliberately. That layout is drawn at desktop width; an email card is 600px
 * before a phone narrows it further, and splitting it puts a 3-step tracker in
 * roughly 260px — which is what wraps "In transit" mid-phrase and squeezes the
 * address into a column an inch wide. Full width each, with a rule between,
 * keeps both legible at every width an inbox actually renders at.
 */
export function emailDeliveryCard(addressHtml: string, trackerHtml?: string): string {
  if (!trackerHtml) return emailOutlinedCard(addressHtml);

  return emailOutlinedCard(
    `${addressHtml}
<div style="margin-top:20px;padding-top:20px;border-top:1px solid ${DIVIDER}">
  ${trackerHtml}
  <div style="text-align:center;margin-top:18px"><img src="${assetSrc(
    "deliveryArt",
  )}" width="280" alt="" style="border:0;display:block;margin:0 auto;width:100%;max-width:280px;height:auto"></div>
</div>`,
  );
}

/**
 * Wraps a rendered body in the branded header/card/footer common to every mail.
 *
 * `trustFooterHtml` is the card-internal footer — a thank-you line and
 * (optionally) the shop's social links — kept separate from `bodyHtml` because
 * it is built from data this module does not have access to (`SocialLink` is
 * a database table; this file stays free of `server-only`, see the file
 * banner). Omit it and the card simply ends after the body, the way every
 * mail before this one did.
 */
export function emailShell(bodyHtml: string, homeUrl: string, trustFooterHtml?: string): string {
  return `
${MOBILE_STYLES}
<div class="ecom-shell" style="background:${WHITE};padding:20px 10px;font-family:${FONT_SANS}">
  <div style="max-width:620px;margin:0 auto">
    <div style="background:${WHITE};border:1px solid ${DIVIDER};border-radius:24px;overflow:hidden">
      <div class="ecom-bar" style="padding:16px 22px;border-bottom:1px solid ${DIVIDER}">
        ${TABLE_OPEN}">
          <tr>
            <td style="width:46px"><span style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;background:${PRIMARY};color:${ON_PRIMARY};border-radius:12px;font-weight:700;font-size:17px;font-family:${FONT_SANS}">E</span></td>
            <td style="font-size:21px;font-weight:700;letter-spacing:-0.01em;color:${ON_SURFACE};white-space:nowrap">${BRAND_NAME}<span style="color:${PRIMARY}">.</span></td>
            <td class="ecom-art" style="text-align:right"><img src="${assetSrc(
              "headerArt",
            )}" width="150" alt="" style="border:0;display:inline-block;width:100%;max-width:150px;height:auto"></td>
          </tr>
        </table>
      </div>
      <div class="ecom-body" style="padding:22px;font-size:15px;line-height:1.6;color:${ON_SURFACE}">
        ${bodyHtml}
      </div>
      ${
        trustFooterHtml
          ? `<div class="ecom-bar" style="padding:18px 22px;border-top:1px solid ${DIVIDER}">${trustFooterHtml}</div>`
          : ""
      }
    </div>
    <p style="margin:18px 0 0;text-align:center;color:${ON_SURFACE_VARIANT};font-size:12px;line-height:1.6">
      <a href="${escapeAttr(homeUrl)}" style="color:${ON_SURFACE_VARIANT};text-decoration:underline">${BRAND_NAME}</a> · This is an automated message — please don't reply to it.
    </p>
  </div>
</div>`.trim();
}

/**
 * The card-internal footer: a thank-you line with a heart tile, and the shop's
 * published social links as small circular initial badges — text links, not
 * the platform's own SVG mark, for the same reason icons elsewhere in this
 * file are emoji rather than `<svg>`.
 */
export function emailTrustFooter(socialLinks: { url: string; label: string }[]): string {
  const socials = socialLinks
    .map(
      (link) =>
        `<a href="${escapeAttr(link.url)}" title="${escapeAttr(
          link.label,
        )}" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:${ON_SURFACE};color:${WHITE};border-radius:999px;text-decoration:none;font-size:14px;font-weight:700;margin-left:6px">${escapeAttr(
          link.label.slice(0, 1).toUpperCase(),
        )}</a>`,
    )
    .join("");

  return `
${TABLE_OPEN}" class="ecom-stack">
  <tr>
    <td class="ecom-iconCell" style="width:48px;vertical-align:middle">${emailIconTile("heart", 36)}</td>
    <td style="vertical-align:middle;font-size:13px;line-height:1.5;color:${ON_SURFACE_VARIANT}">
      Thank you for shopping with <span style="color:${PRIMARY};font-weight:600">${BRAND_NAME}.</span><br><span style="font-family:${FONT_DISPLAY};font-style:italic;font-size:14px">We appreciate your trust.</span>
    </td>
    ${socials ? `<td class="ecom-socials" style="vertical-align:middle;text-align:right;white-space:nowrap">${socials}</td>` : ""}
  </tr>
</table>`.trim();
}
