import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Draws the line art the emails use, as PNG.
 *
 * A mail client is not a browser: inline `<svg>` is dropped outright by
 * Outlook's Word rendering engine and stripped by Gmail, and a `data:` URI in
 * an `<img src>` is blocked by Gmail too. A PNG delivered as an inline
 * attachment is the one form every client renders — see `lib/email/assets` for
 * the sending half. So the art is authored as SVG here, where it can be read
 * and edited, and rasterised once into `public/email` rather than being
 * hand-drawn as PNG or fetched from a CDN the CSP would have to trust.
 *
 * Committed output, deliberately: these change about never, and a build step
 * that has to run before mail looks right is a build step someone will forget.
 *
 *   npm run build:email-art
 */

const BLUE = "#0b57d0";
const PALE = "#e8f0fd";
const PALER = "#f2f7fe";
const RULE = "#c9dcfa";

/** A stroked 24×24 glyph, with the shop's line weight. */
function icon(body: string, stroke = BLUE): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/**
 * The three the tracker draws, whose colour depends on where the parcel is.
 *
 * A reached step is a filled brand-blue dot, so its glyph has to be white to
 * be seen at all; an unreached one is a plain outlined dot and takes the muted
 * text colour. Same paths, three inks — emitted as separate files because a
 * PNG cannot be recoloured by the CSS around it the way a font glyph can.
 */
const TRACKER_PATHS: Record<string, string> = {
  truck: `<path d="M1.6 6.4h12.2v9.8H1.6z"/><path d="M13.8 9.8h3.7l3.9 4.1v2.3h-7.6z"/><circle cx="5.6" cy="18.2" r="2"/><circle cx="17.6" cy="18.2" r="2"/>`,
  box: `<path d="M12 2.6 20.8 7v10L12 21.4 3.2 17V7z"/><path d="M3.2 7 12 11.4 20.8 7"/><path d="M12 11.4v10"/>`,
  home: `<path d="M3.4 10.4 12 3.3l8.6 7.1"/><path d="M5.5 9.3V20.4h13V9.3"/><path d="M9.8 20.4v-5.6h4.4v5.6"/>`,
};

const BAG_PATH = `<path d="M4.4 7.4h15.2l-1.3 12.7a1.7 1.7 0 0 1-1.7 1.5H7.4a1.7 1.7 0 0 1-1.7-1.5z"/><path d="M8.9 10.2V6.5a3.1 3.1 0 0 1 6.2 0v3.7"/>`;

const RECEIPT_PATH = `<path d="M5.2 2.6h13.6v18.8l-2.3-1.6-2.3 1.6-2.2-1.6-2.3 1.6-2.2-1.6-2.3 1.6z"/><path d="M8.8 8.2h6.4M8.8 12.2h6.4"/>`;

const ICONS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(TRACKER_PATHS).flatMap(([name, body]) => [
      [name, icon(body)],
      [`${name}-on`, icon(body, "#ffffff")],
      [`${name}-off`, icon(body, "#8b8e98")],
    ]),
  ),
  pin: icon(
    `<path d="M12 21.4s7-6.5 7-11.6a7 7 0 1 0-14 0c0 5.1 7 11.6 7 11.6z"/><circle cx="12" cy="9.8" r="2.7"/>`,
  ),
  bag: icon(BAG_PATH),
  // On the filled button, where brand-blue line art would be invisible.
  "bag-on": icon(BAG_PATH, "#ffffff"),
  receipt: icon(RECEIPT_PATH),
  // On the filled button, where brand-blue line art would be invisible.
  "receipt-on": icon(RECEIPT_PATH, "#ffffff"),
  reset: icon(`<path d="M20.4 12a8.4 8.4 0 1 1-2.7-6.2"/><path d="M20.4 3.4v5.8h-5.8"/>`),
  card: icon(`<rect x="2.4" y="5" width="19.2" height="14" rx="2.6"/><path d="M2.4 9.6h19.2"/>`),
  clock: icon(`<circle cx="12" cy="12" r="9"/><path d="M12 6.8v5.5l3.4 2"/>`),
  check: icon(`<circle cx="12" cy="12" r="9"/><path d="M7.9 12.3l2.9 2.8 5.3-5.6"/>`),
  cancel: icon(`<circle cx="12" cy="12" r="9"/><path d="M9.1 9.1l5.8 5.8M14.9 9.1l-5.8 5.8"/>`),
  lock: icon(
    `<rect x="4.2" y="10.4" width="15.6" height="10.4" rx="2.4"/><path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8"/>`,
  ),
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 20.8S3.2 15 3.2 9.1A4.9 4.9 0 0 1 12 6.2a4.9 4.9 0 0 1 8.8 2.9c0 5.9-8.8 11.7-8.8 11.7z" fill="${BLUE}"/></svg>`,
};

/**
 * The masthead flourish: a parcel, ticked, coming in over cloud.
 *
 * Sits opposite the wordmark, so it is drawn to be read at a glance and
 * ignored the rest of the time — pale enough not to compete with the headline
 * three lines below it.
 */
const ART_HEADER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 80">
  <path d="M38 48c-6.4 0-11.6-5.2-11.6-11.6S31.6 24.8 38 24.8c2.1-7.2 8.7-12.4 16.5-12.4s14.4 5.2 16.5 12.4c6.4 0 11.6 5.2 11.6 11.6S77.4 48 71 48z" fill="${PALE}"/>
  <path d="M98 56c-4.4 0-8-3.6-8-8s3.6-8 8-8c1.5-5 6.1-8.6 11.6-8.6s10.1 3.6 11.6 8.6c4.4 0 8 3.6 8 8s-3.6 8-8 8z" fill="${PALER}"/>
  <path d="M136 28h30M143 39h23M150 50h16" stroke="${RULE}" stroke-width="3.2" stroke-linecap="round"/>
  <g stroke="${BLUE}" stroke-width="2.3" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M184 15l24 12.2v25.6L184 65l-24-12.2V27.2z"/>
    <path d="M160 27.2 184 39.4l24-12.2"/>
    <path d="M184 39.4V65"/>
  </g>
  <circle cx="207" cy="57" r="11.5" fill="${BLUE}"/>
  <path d="M201.6 57.2l3.7 3.6 6.6-7" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * The parcel's journey: a van on a dotted route into town, and a pin waiting
 * at the end of it. Shown beside the tracker on a shipped or delivered order.
 */
const ART_DELIVERY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 120">
  <g fill="${PALE}">
    <rect x="124" y="48" width="26" height="58" rx="2"/>
    <rect x="154" y="30" width="22" height="76" rx="2"/>
    <rect x="180" y="58" width="24" height="48" rx="2"/>
    <rect x="208" y="40" width="20" height="66" rx="2"/>
    <rect x="232" y="64" width="26" height="42" rx="2"/>
  </g>
  <g fill="${RULE}">
    <rect x="131" y="56" width="5" height="6" rx="1"/><rect x="140" y="56" width="5" height="6" rx="1"/>
    <rect x="131" y="70" width="5" height="6" rx="1"/><rect x="140" y="70" width="5" height="6" rx="1"/>
    <rect x="160" y="40" width="5" height="6" rx="1"/><rect x="169" y="40" width="5" height="6" rx="1"/>
    <rect x="160" y="54" width="5" height="6" rx="1"/><rect x="169" y="54" width="5" height="6" rx="1"/>
    <rect x="187" y="68" width="5" height="6" rx="1"/><rect x="196" y="68" width="5" height="6" rx="1"/>
    <rect x="214" y="50" width="5" height="6" rx="1"/><rect x="214" y="64" width="5" height="6" rx="1"/>
    <rect x="239" y="74" width="5" height="6" rx="1"/><rect x="248" y="74" width="5" height="6" rx="1"/>
  </g>
  <path d="M96 40c-3.6 0-6.6-3-6.6-6.6s3-6.6 6.6-6.6c1.2-4.1 5-7 9.5-7s8.3 2.9 9.5 7c3.6 0 6.6 3 6.6 6.6s-3 6.6-6.6 6.6z" fill="${PALER}"/>
  <path d="M58 92C62 62 104 70 140 44" stroke="${RULE}" stroke-width="2.6" stroke-dasharray="5 7" fill="none" stroke-linecap="round"/>
  <path d="M236 8c-7.7 0-13.9 6.2-13.9 13.9 0 10.4 13.9 22.6 13.9 22.6s13.9-12.2 13.9-22.6C249.9 14.2 243.7 8 236 8z" fill="${BLUE}"/>
  <circle cx="236" cy="21.6" r="5" fill="#fff"/>
  <path d="M12 106h256" stroke="${RULE}" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="26" y="68" width="42" height="30" rx="3.5" fill="${BLUE}"/>
  <path d="M68 78h11.5l8.5 9.5V98H68z" fill="${BLUE}"/>
  <circle cx="41" cy="100" r="7" fill="#1b1b1f"/><circle cx="41" cy="100" r="2.8" fill="#fff"/>
  <circle cx="79" cy="100" r="7" fill="#1b1b1f"/><circle cx="79" cy="100" r="2.8" fill="#fff"/>
  <path d="M47 75c-3.5 0-6.2 2.7-6.2 6.2 0 4.6 6.2 9.8 6.2 9.8s6.2-5.2 6.2-9.8c0-3.5-2.7-6.2-6.2-6.2z" fill="#fff"/>
  <circle cx="47" cy="81" r="2.4" fill="${BLUE}"/>
</svg>`;


/**
 * The welcome mail's masthead: a bag, not a parcel.
 *
 * `ART_HEADER` is about something being *sent* — a ticked box in transit —
 * which is the wrong promise at the top of a message to somebody who has just
 * made an account and bought nothing. Same canvas and same palette so the two
 * sit at the same weight beside the wordmark.
 */
const ART_HEADER_WELCOME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 80">
  <path d="M36 48c-6.4 0-11.6-5.2-11.6-11.6s5.2-11.6 11.6-11.6c2.1-7.2 8.7-12.4 16.5-12.4s14.4 5.2 16.5 12.4c6.4 0 11.6 5.2 11.6 11.6S75.4 48 69 48z" fill="${PALE}"/>
  <path d="M96 57c-4.4 0-8-3.6-8-8s3.6-8 8-8c1.5-5 6.1-8.6 11.6-8.6s10.1 3.6 11.6 8.6c4.4 0 8 3.6 8 8s-3.6 8-8 8z" fill="${PALER}"/>
  <path d="M141 20l2.6 6.9 6.9 2.6-6.9 2.6-2.6 6.9-2.6-6.9-6.9-2.6 6.9-2.6z" fill="${RULE}"/>
  <path d="M152 52l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" fill="${RULE}"/>
  <path d="M209 14l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6 4.2-1.6z" fill="${RULE}"/>
  <g stroke="${BLUE}" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M168 32h40l-3.6 33.4a3.6 3.6 0 0 1-3.6 3.2h-25.6a3.6 3.6 0 0 1-3.6-3.2z"/>
    <path d="M179.8 35.4v-8.6a8.2 8.2 0 0 1 16.4 0v8.6"/>
  </g>
</svg>`;

/**
 * The shop, with its door open.
 *
 * Carries the welcome mail the way `ART_DELIVERY` carries a shipped one: it is
 * the only picture in the message and it has to say "come in" rather than
 * decorate. Drawn front-on and centred, so it reads at the width a phone gives
 * it as well as at full card width.
 */
const ART_WELCOME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 120">
  <path d="M52 34c-3.6 0-6.6-3-6.6-6.6s3-6.6 6.6-6.6c1.2-4.1 5-7 9.5-7s8.3 2.9 9.5 7c3.6 0 6.6 3 6.6 6.6s-3 6.6-6.6 6.6z" fill="${PALER}"/>
  <path d="M232 44c-3.1 0-5.6-2.5-5.6-5.6s2.5-5.6 5.6-5.6c1-3.5 4.2-6 8-6s7 2.5 8 6c3.1 0 5.6 2.5 5.6 5.6s-2.5 5.6-5.6 5.6z" fill="${PALER}"/>
  <path d="M40 58l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2z" fill="${RULE}"/>
  <path d="M243 66l1.8 4.7 4.7 1.8-4.7 1.8-1.8 4.7-1.8-4.7-4.7-1.8 4.7-1.8z" fill="${RULE}"/>
  <path d="M96 20l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6 4.2-1.6z" fill="${RULE}"/>
  <rect x="82" y="46" width="116" height="58" rx="3" fill="${PALE}"/>
  <path d="M74 46l8-14h116l8 14z" fill="${BLUE}"/>
  <path d="M82 32h19.3l-4 14H74zM120.7 32H140l1.3 14h-23zM159.3 32h19.3l6.7 14h-23z" fill="#ffffff" opacity="0.34"/>
  <rect x="94" y="60" width="40" height="30" rx="2" fill="#ffffff"/>
  <rect x="100" y="68" width="11" height="14" rx="1.5" fill="${RULE}"/>
  <rect x="116" y="72" width="12" height="10" rx="1.5" fill="${RULE}"/>
  <rect x="148" y="60" width="34" height="44" rx="2" fill="#ffffff"/>
  <path d="M148 60h34v44" fill="none" stroke="${RULE}" stroke-width="1.6"/>
  <circle cx="176" cy="84" r="2.2" fill="${BLUE}"/>
  <path d="M20 104h240" stroke="${RULE}" stroke-width="2.4" stroke-linecap="round"/>
  <g stroke="${BLUE}" stroke-width="2.2" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M212 76h20l-1.8 17a2 2 0 0 1-2 1.8h-12.4a2 2 0 0 1-2-1.8z"/>
    <path d="M218 78v-4.6a4 4 0 0 1 8 0V78"/>
  </g>
</svg>`;

const OUT = join(process.cwd(), "public", "email");
mkdirSync(OUT, { recursive: true });

async function write(name: string, svg: string, width: number) {
  const png = await sharp(Buffer.from(svg)).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`  ${name}.png  ${(png.length / 1024).toFixed(1)} kB`);
}

async function main() {
  console.log("Rasterising email art into public/email");
  // 3× the largest size any of them is displayed at, so they stay sharp on a
  // retina screen without shipping more bytes than a mail needs to carry.
  for (const [name, svg] of Object.entries(ICONS)) await write(`icon-${name}`, svg, 108);
  await write("art-header", ART_HEADER, 660);
  await write("art-header-welcome", ART_HEADER_WELCOME, 660);
  await write("art-welcome", ART_WELCOME, 840);
  await write("art-delivery", ART_DELIVERY, 840);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
